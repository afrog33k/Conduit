import ConduitGrpcSdk, {
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  ConduitString,
  ConfigController,
  GrpcError,
  RoutingManager,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { OAuth2 } from '../OAuth2';
import * as googleParameters from './google.json';
import { GoogleUser } from './google.user';
import axios from 'axios';
import { OAuth2Settings } from '../interfaces/OAuth2Settings';
import { ProviderConfig } from '../interfaces/ProviderConfig';
import { ConnectionParams } from '../interfaces/ConnectionParams';
import { Payload } from '../interfaces/Payload';

export class GoogleHandlers extends OAuth2<GoogleUser, OAuth2Settings> {
  constructor(grpcSdk: ConduitGrpcSdk, config: { google: ProviderConfig }) {
    super(grpcSdk, 'google', new OAuth2Settings(config.google, googleParameters));
    this.defaultScopes = [
      'https://www.googleapis.com/auth/userinfo.email',
      ' https://www.googleapis.com/auth/userinfo.profile',
    ];
  }

  async connectWithProvider(details: ConnectionParams): Promise<Payload<GoogleUser>> {
    if (!this.initialized)
      throw new GrpcError(status.NOT_FOUND, 'Requested resource not found');

    const googleUser = await axios
      .get(
        `https://www.googleapis.com/oauth2/v1/userinfo?alt=json&access_token=${details.accessToken}&token_type=Bearer`,
      )
      .then(res => res.data)
      .catch(error => {
        ConduitGrpcSdk.Logger.error(`Failed to fetch user`);
        throw new Error(error.message);
      });

    return {
      id: googleUser.id,
      email: googleUser.email,
      data: {
        name: googleUser.name,
        given_name: googleUser.givenName,
        locale: googleUser.locale,
        verified_email: googleUser.verified_email,
        picture: googleUser.picture,
        family_name: googleUser.familyName,
      },
    };
  }

  declareRoutes(routingManager: RoutingManager) {
    super.declareRoutes(routingManager);
    const captchaConfig = ConfigController.getInstance().config.captcha;
    routingManager.route(
      {
        path: '/google',
        action: ConduitRouteActions.POST,
        description: `Login/register with Google by providing a token from the client.`,
        bodyParams: {
          id_token: ConduitString.Required,
          access_token: ConduitString.Required,
          expires_in: ConduitString.Optional,
          invitationToken: ConduitString.Optional,
          captchaToken: ConduitString.Optional,
        },
      },
      new ConduitRouteReturnDefinition('GoogleResponse', {
        userId: ConduitString.Required,
        accessToken: ConduitString.Required,
        refreshToken: ConduitString.Required,
      }),
      this.authenticate.bind(this),
    );
  }

  constructScopes(scopes: string[]): string {
    return scopes.join(' ');
  }
}
