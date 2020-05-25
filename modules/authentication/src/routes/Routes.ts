import { LocalHandlers } from '../handlers/auth/local';
import * as grpc from 'grpc';
import ConduitGrpcSdk, {
  ConduitRoute,
  ConduitRouteActions,
  ConduitRouteReturnDefinition, ConduitString,
  constructRoute,
  TYPE
} from '@conduit/grpc-sdk';
import { AuthService } from '../services/auth';
const protoLoader = require('@grpc/proto-loader');
const PROTO_PATH = __dirname + '/router.proto';

export class AuthenticationRoutes {
  private readonly localHandlers: LocalHandlers;

  constructor(server: grpc.Server, private readonly grpcSdk: ConduitGrpcSdk, authService: AuthService) {
    this.localHandlers = new LocalHandlers(grpcSdk, authService);

    const packageDefinition = protoLoader.loadSync(
      PROTO_PATH,
      {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true
      }
    );

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    // @ts-ignore
    const router = protoDescriptor.authentication.router.Router;
    server.addService(router.service, {
      register: this.localHandlers.register.bind(this.localHandlers),
      authenticateLocal: this.localHandlers.authenticate.bind(this.localHandlers),
      forgotPassword: this.localHandlers.forgotPassword.bind(this.localHandlers),
      resetPassword: this.localHandlers.resetPassword.bind(this.localHandlers),
      verifyEmail: this.localHandlers.verifyEmail.bind(this.localHandlers)
    });
  }

  get registeredRoutes(): any[] {
    let routesArray: any[] = [];

    routesArray.push(constructRoute(new ConduitRoute({
        path: '/authentication/local/new',
        action: ConduitRouteActions.POST,
        bodyParams: {
          email: TYPE.String,
          password: TYPE.String
        }
      },
      new ConduitRouteReturnDefinition('RegisterResponse', 'String'),
      'register'
      )));

    routesArray.push(constructRoute(new ConduitRoute(  {
        path: '/authentication/local',
        action: ConduitRouteActions.POST,
        bodyParams: {
          email: TYPE.String,
          password: TYPE.String
        }
      },
      new ConduitRouteReturnDefinition('LoginResponse', {
        userId: ConduitString.Required,
        accessToken: ConduitString.Required,
        refreshToken: ConduitString.Required
      }), 'authenticate')));

    routesArray.push(constructRoute(new ConduitRoute({
        path: '/authentication/forgot-password',
        action: ConduitRouteActions.POST,
        bodyParams: {
          email: TYPE.String
        }
      },
      new ConduitRouteReturnDefinition('ForgotPasswordResponse', 'String'),
      'forgotPassword'
    )));

    routesArray.push(constructRoute(new ConduitRoute({
        path: '/authentication/reset-password',
        action: ConduitRouteActions.POST,
        bodyParams: {
          passwordResetToken: TYPE.String,
          password: TYPE.String
        }
      },
      new ConduitRouteReturnDefinition('ResetPasswordResponse', 'String'),
      'resetPassword'
      )));

    routesArray.push(constructRoute(new ConduitRoute({
        path: '/authentication/verify-email',
        action: ConduitRouteActions.GET,
        urlParams: {
          verificationToken: TYPE.String
        }
    }, new ConduitRouteReturnDefinition('', ''),
      'verifyEmail'
    )));

    return routesArray;
  }
}
