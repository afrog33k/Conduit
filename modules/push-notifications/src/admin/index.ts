import ConduitGrpcSdk, {
  ConduitRouteActions,
  ConduitRouteReturnDefinition,
  ConduitString,
  GrpcError,
  GrpcServer,
  ParsedRouterRequest,
  RouteOptionType,
  RoutingManager,
  TYPE,
  UnparsedRouterResponse,
} from '@conduitplatform/grpc-sdk';
import { status } from '@grpc/grpc-js';
import { isNil } from 'lodash';
import { IPushNotificationsProvider } from '../interfaces/IPushNotificationsProvider';
import { NotificationToken } from '../models';
import { ISendNotification } from '../interfaces/ISendNotification';

export class AdminHandlers {
  private provider: IPushNotificationsProvider;
  private readonly routingManager: RoutingManager;

  constructor(
    private readonly server: GrpcServer,
    private readonly grpcSdk: ConduitGrpcSdk,
    provider: IPushNotificationsProvider,
  ) {
    this.provider = provider;
    this.routingManager = new RoutingManager(this.grpcSdk.admin, this.server);
    this.registerAdminRoutes();
  }

  updateProvider(provider: IPushNotificationsProvider) {
    this.provider = provider;
  }

  private registerAdminRoutes() {
    this.routingManager.clear();

    this.routingManager.route(
      {
        path: '/send',
        action: ConduitRouteActions.POST,
        description: `Sends a notification.`,
        bodyParams: {
          userId: ConduitString.Required,
          title: ConduitString.Required,
          body: ConduitString.Optional,
          data: ConduitString.Optional,
          platform: ConduitString.Optional,
        },
      },
      new ConduitRouteReturnDefinition('SendNotification', 'String'),
      this.sendNotification.bind(this),
    );
    this.routingManager.route(
      {
        path: '/sendToManyDevices',
        action: ConduitRouteActions.POST,
        description: `Sends a notification to multiple devices.`,
        bodyParams: {
          userIds: { type: [TYPE.String], required: true }, // handler array check is still required
          title: ConduitString.Required,
          body: ConduitString.Optional,
          data: ConduitString.Optional,
          platform: ConduitString.Optional,
        },
      },
      new ConduitRouteReturnDefinition('SendNotificationToManyDevices', 'String'),
      this.sendNotificationToManyDevices.bind(this),
    );
    this.routingManager.route(
      {
        path: '/sendMany',
        action: ConduitRouteActions.POST,
        description: `Sends many notifications to many devices.`,
        bodyParams: {
          notifications: {
            type: [
              {
                sendTo: ConduitString.Required,
                title: ConduitString.Required,
                body: ConduitString.Optional,
                data: ConduitString.Optional,
                platform: ConduitString.Optional,
              },
            ],
            required: true,
          },
        },
      },
      new ConduitRouteReturnDefinition('SendManyNotifications', 'String'),
      this.sendManyNotifications.bind(this),
    );
    this.routingManager.route(
      {
        path: '/token/:userId',
        action: ConduitRouteActions.GET,
        description: `Returns a user's notification token.`,
        urlParams: {
          userId: { type: RouteOptionType.String, required: true },
        },
      },
      new ConduitRouteReturnDefinition('GetNotificationToken', {
        tokenDocuments: ['NotificationToken'],
      }),
      this.getNotificationToken.bind(this),
    );
    this.routingManager.registerRoutes();
  }

  async sendNotification(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const params = {
      sendTo: call.request.params.userId,
      title: call.request.params.title,
      body: call.request.params.body,
      data: call.request.params.data,
      platform: call.request.params.platform,
    };
    await this.provider.sendToDevice(params).catch(e => {
      throw new GrpcError(status.INTERNAL, e.message);
    });
    ConduitGrpcSdk.Metrics?.increment('push_notifications_sent_total', 1);
    return 'Ok';
  }

  async sendNotificationToManyDevices(
    call: ParsedRouterRequest,
  ): Promise<UnparsedRouterResponse> {
    if (call.request.params.userIds.length === 0) {
      // array check is required
      throw new GrpcError(
        status.INVALID_ARGUMENT,
        'ids is required and must be an non-empty array',
      );
    }
    const params = {
      sendTo: call.request.params.userIds,
      title: call.request.params.title,
      body: call.request.params.body,
      data: call.request.params.data,
    };
    await this.provider.sendToManyDevices(params).catch(e => {
      throw new GrpcError(status.INTERNAL, e.message);
    });
    ConduitGrpcSdk.Metrics?.increment(
      'push_notifications_sent_total',
      call.request.params.userIds.length,
    );
    return 'Ok';
  }

  async sendManyNotifications(
    call: ParsedRouterRequest,
  ): Promise<UnparsedRouterResponse> {
    const params: ISendNotification[] = call.request.params.notifications;
    await this.provider.sendMany(params).catch(e => {
      throw new GrpcError(status.INTERNAL, e.message);
    });
    ConduitGrpcSdk.Metrics?.increment(
      'push_notifications_sent_total',
      call.request.params.userIds.length,
    );
    return 'Ok';
  }

  async getNotificationToken(call: ParsedRouterRequest): Promise<UnparsedRouterResponse> {
    const tokenDocuments = await NotificationToken.getInstance().findMany({
      userId: call.request.params.userId,
    });
    if (isNil(tokenDocuments)) {
      throw new GrpcError(status.NOT_FOUND, 'Could not find a token for user');
    }
    return { tokenDocuments };
  }
}
