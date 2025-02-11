import ConduitGrpcSdk, {
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  ConduitString,
  ConfigController,
  GrpcError,
  ParsedRouterRequest,
  RoutingManager,
  UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { isNil } from 'lodash';
import { status } from '@grpc/grpc-js';
import { Token, User } from '../../models';
import axios from 'axios';
import { Payload } from './interfaces/Payload';
import { OAuth2Settings } from './interfaces/OAuth2Settings';
import { RedirectOptions } from './interfaces/RedirectOptions';
import { AuthParams } from './interfaces/AuthParams';
import { IAuthenticationStrategy } from '../../interfaces/AuthenticationStrategy';
import { ConnectionParams } from './interfaces/ConnectionParams';
import { OAuthRequest } from './interfaces/MakeRequest';
import { TokenProvider } from '../tokenProvider';
import { TokenType } from '../../constants/TokenType';
import { v4 as uuid } from 'uuid';
import moment from 'moment/moment';
import { createHash } from 'crypto';
import { TeamsHandler } from '../team';

export abstract class OAuth2<T, S extends OAuth2Settings>
  implements IAuthenticationStrategy
{
  grpcSdk: ConduitGrpcSdk;
  initialized: boolean = false;
  mapScopes: { [key: string]: string };
  defaultScopes: string[];
  protected settings: S;
  private readonly providerName: string;

  protected constructor(grpcSdk: ConduitGrpcSdk, providerName: string, settings: S) {
    this.providerName = providerName;
    this.grpcSdk = grpcSdk;
    this.settings = settings;
    this.settings.provider = providerName;
  }

  async validate(): Promise<boolean> {
    const authConfig = ConfigController.getInstance().config;
    if (!authConfig[this.providerName].enabled) {
      ConduitGrpcSdk.Logger.log(`${this.providerName} authentication not available`);
      return (this.initialized = false);
    }
    if (
      !authConfig[this.providerName] ||
      !authConfig[this.providerName].clientId ||
      !authConfig[this.providerName].clientSecret
    ) {
      ConduitGrpcSdk.Logger.log(`${this.providerName} authentication not available`);
      return (this.initialized = false);
    }
    ConduitGrpcSdk.Logger.log(`${this.providerName} authentication is available`);
    return (this.initialized = true);
  }

  async redirect(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const scopes = call.request.params?.scopes ?? this.defaultScopes;
    const conduitUrl = (await this.grpcSdk.config.get('router')).hostUrl;
    let codeChallenge;
    if (!isNil(this.settings.codeChallengeMethod)) {
      codeChallenge = createHash('sha256')
        .update(this.settings.codeVerifier!)
        .digest('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    const queryOptions: RedirectOptions = {
      client_id: this.settings.clientId,
      redirect_uri: conduitUrl + this.settings.callbackUrl,
      response_type: this.settings.responseType,
      response_mode: this.settings.responseMode,
      scope: this.constructScopes(scopes),
      ...(codeChallenge !== undefined && { code_challenge: codeChallenge }),
      ...(this.settings.codeChallengeMethod !== undefined && {
        code_challenge_method: this.settings.codeChallengeMethod,
      }),
    };
    const baseUrl = this.settings.authorizeUrl;

    const stateToken = await Token.getInstance()
      .create({
        type: TokenType.STATE_TOKEN,
        token: uuid(),
        data: {
          invitationToken: call.request.params?.invitationToken,
          clientId: call.request.context.clientId,
          scope: queryOptions.scope,
          codeChallenge: codeChallenge,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      })
      .catch(err => {
        throw new GrpcError(status.INTERNAL, err);
      });
    queryOptions['state'] = stateToken.token;

    const keys = Object.keys(queryOptions) as [keyof RedirectOptions];
    const queryString = keys
      .map(k => {
        return k + '=' + queryOptions[k];
      })
      .join('&');
    return baseUrl + '?' + queryString;
  }

  async authorize(call: ParsedRouterRequest) {
    const params = call.request.params;
    const stateToken: Token | null = await Token.getInstance().findOne({
      token: params.state,
    });
    if (isNil(stateToken))
      throw new GrpcError(status.INVALID_ARGUMENT, 'Invalid parameters');
    if (moment().isAfter(moment(stateToken.data.expiresAt))) {
      await Token.getInstance().deleteOne(stateToken);
      throw new GrpcError(status.INVALID_ARGUMENT, 'Token expired');
    }
    const conduitUrl = (await this.grpcSdk.config.get('router')).hostUrl;
    const myParams: AuthParams = {
      client_id: this.settings.clientId,
      client_secret: this.settings.clientSecret,
      code: params.code,
      redirect_uri: `${conduitUrl}/hook/authentication/${this.settings.providerName}`,
    };

    if (this.settings.hasOwnProperty('grantType')) {
      myParams['grant_type'] = this.settings.grantType;
    }
    if (!isNil(this.settings.codeChallengeMethod)) {
      myParams['code_verifier'] = this.settings.codeVerifier;
    }

    const providerOptions = this.makeRequest(myParams);
    const providerResponse: { data: { access_token: string } } = await axios(
      providerOptions,
    ).catch(err => {
      throw new GrpcError(status.INTERNAL, err.message);
    });
    const access_token = providerResponse.data.access_token;

    const clientId = stateToken.data.clientId;
    const scope = stateToken.data.scope;
    const payload = await this.connectWithProvider({
      accessToken: access_token,
      clientId,
      scope: scope,
    });

    await Token.getInstance().deleteOne(stateToken);
    const user = await this.createOrUpdateUser(payload);
    const config = ConfigController.getInstance().config;
    ConduitGrpcSdk.Metrics?.increment('logged_in_users_total');

    return TokenProvider.getInstance().provideUserTokens(
      {
        user,
        clientId,
        config,
      },
      this.settings.finalRedirect,
    );
  }

  async authenticate(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    ConduitGrpcSdk.Metrics?.increment('login_requests_total');
    const payload = await this.connectWithProvider({
      accessToken: call.request.params['access_token'],
      clientId: call.request.params['clientId'],
      scope: call.request.params?.scope,
    });
    const user = await this.createOrUpdateUser(payload);
    const config = ConfigController.getInstance().config;
    ConduitGrpcSdk.Metrics?.increment('logged_in_users_total');

    return TokenProvider.getInstance().provideUserTokens({
      user,
      clientId: call.request.params['clientId'],
      config,
    });
  }

  async createOrUpdateUser(payload: Payload<T>, invitationToken?: string): Promise<User> {
    let user: User | null = null;
    if (payload.hasOwnProperty('email')) {
      user = await User.getInstance().findOne({
        email: payload.email,
      });
    } else if (payload.hasOwnProperty('id') && !payload.hasOwnProperty('email')) {
      user = await User.getInstance().findOne({
        [this.providerName]: { id: payload.id },
      });
    }
    if (!isNil(user)) {
      if (!user!.active) throw new GrpcError(status.PERMISSION_DENIED, 'Inactive user');
      if (!this.settings.accountLinking) {
        throw new GrpcError(
          status.PERMISSION_DENIED,
          'User with this email already exists',
        );
      }

      // @ts-ignore
      user[this.providerName] = payload;
      // TODO look into this again, as the email the user has registered will still not be verified
      if (!user.isVerified) user.isVerified = true;
      user = await User.getInstance().findByIdAndUpdate(user._id, user);
    } else {
      user = await User.getInstance().create({
        email: payload.email,
        [this.providerName]: payload,
        isVerified: true,
      });
      if (invitationToken) {
        await TeamsHandler.getInstance()
          .addUserToTeam(user, invitationToken)
          .catch(err => {
            ConduitGrpcSdk.Logger.error(err);
          });
      } else {
        await TeamsHandler.getInstance()
          .addUserToDefault(user)
          .catch(err => {
            ConduitGrpcSdk.Logger.error(err);
          });
      }
    }
    return user!;
  }

  declareRoutes(routingManager: RoutingManager) {
    const captchaConfig = ConfigController.getInstance().config.captcha;
    routingManager.route(
      {
        path: `/init/${this.providerName}`,
        description: `Begins ${this.capitalizeProvider()} authentication.`,
        action: ConduitRouteActions.GET,
        queryParams: {
          scopes: [ConduitString.Optional],
          invitationToken: ConduitString.Optional,
          captchaToken: ConduitString.Optional,
        },
        middlewares:
          captchaConfig.enabled && captchaConfig.routes.oAuth2
            ? ['captchaMiddleware']
            : undefined,
      },
      new ConduitRouteReturnDefinition(
        `${this.capitalizeProvider()}InitResponse`,
        'String',
      ),
      this.redirect.bind(this),
    );

    if (this.settings.responseMode === 'query') {
      routingManager.route(
        {
          path: `/hook/${this.providerName}`,
          action: ConduitRouteActions.GET,
          description: `Login/register with ${this.capitalizeProvider()} using redirect.`,
          queryParams: {
            code: ConduitString.Required,
            state: ConduitString.Required,
          },
        },
        new ConduitRouteReturnDefinition(`${this.capitalizeProvider()}Response`, {
          accessToken: ConduitString.Optional,
          refreshToken: ConduitString.Optional,
        }),
        this.authorize.bind(this),
      );
    } else {
      routingManager.route(
        {
          path: `/hook/${this.providerName}`,
          action: ConduitRouteActions.POST,
          description: `Login/register with ${this.capitalizeProvider()} using redirect.`,
          bodyParams: {
            code: ConduitString.Required,
            state: ConduitString.Required,
          },
        },
        new ConduitRouteReturnDefinition(`${this.capitalizeProvider()}Response`, {
          accessToken: ConduitString.Optional,
          refreshToken: ConduitString.Optional,
        }),
        this.authorize.bind(this),
      );
    }
  }

  makeRequest(data: AuthParams): OAuthRequest {
    return {
      method: this.settings.accessTokenMethod,
      url: this.settings.tokenUrl,
      params: { ...data },
      headers: {
        Accept: 'application/json',
      },
    };
  }

  abstract connectWithProvider(details: ConnectionParams): Promise<Payload<T>>;

  constructScopes(scopes: string[]): string {
    return scopes.join(',');
  }

  private capitalizeProvider = () => {
    return this.providerName.charAt(0).toUpperCase() + this.providerName.substr(1);
  };
}
