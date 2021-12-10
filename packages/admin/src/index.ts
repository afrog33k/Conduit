import { Application } from 'express';
import { isNil } from 'lodash';
import { loadPackageDefinition, Server, status } from '@grpc/grpc-js';
import ConduitGrpcSdk from '@quintessential-sft/conduit-grpc-sdk';
import { RestController } from '@quintessential-sft/conduit-router';
import {
  ConduitCommons,
  ConduitRoute,
  ConduitMiddleware,
  ConduitSocket,
  IConduitAdmin,
  grpcToConduitRoute,
  ConduitRouteActions,
} from '@quintessential-sft/conduit-commons';
import * as middleware from './middleware';
import * as adminRoutes from './routes';
import { hashPassword } from './utils/auth';
import { AdminSchema } from './models/Admin';
import AdminConfigSchema from './config';

export default class AdminModule extends IConduitAdmin {
  conduit: ConduitCommons;
  grpcSdk: ConduitGrpcSdk;
  private readonly _app: Application;
  private _restRouter: RestController;
  private _sdkRoutes: ConduitRoute[];
  private _grpcRoutes: any = {};

  constructor(
    app: Application,
    grpcSdk: ConduitGrpcSdk,
    conduit: ConduitCommons,
    packageDefinition: any,
    server: Server
  ) {
    super();
    this.conduit = conduit;
    this.grpcSdk = grpcSdk;

    this._app = app;
    this._restRouter = new RestController(this._app);

    this._restRouter.registerRoute('*', middleware.getAdminMiddleware(this.conduit));
    this._restRouter.registerRoute(
      '*',
      middleware.getAuthMiddleware(this.grpcSdk, this.conduit)
    );
    // Register Pre-Auth-Middleware routes
    const preAuthMiddlewareRoutes: ConduitRoute[] = [];
    preAuthMiddlewareRoutes.push(adminRoutes.getLoginRoute(this.conduit, this.grpcSdk));
    preAuthMiddlewareRoutes.push(adminRoutes.getModulesRoute(this.conduit));
    preAuthMiddlewareRoutes.forEach((route) => {
      this._restRouter.registerConduitRoute(route);
    }, this);

    this._grpcRoutes = {};
    this._sdkRoutes = [
      adminRoutes.getCreateAdminRoute(this.conduit, this.grpcSdk)
    ];

    // Register Post-Auth-Middleware routes
    this._sdkRoutes.forEach((route) => {
      this._restRouter.registerConduitRoute(route);
    }, this);

    let protoDescriptor = loadPackageDefinition(packageDefinition);

    // @ts-ignore
    let admin = protoDescriptor.conduit.core.Admin;
    server.addService(admin.service, {
      registerAdminRoute: this.registerAdminRoute.bind(this),
    });
  }

  async initialize() {
    await this.conduit
      .getConfigManager()
      .registerModulesConfig('admin', AdminConfigSchema.getProperties());
    await this.handleDatabase().catch(console.log);
    this.attachRouter();
    this.highAvailability().catch(() => {
      console.log('Failed to recover state');
    });
  }

  // grpc
  async registerAdminRoute(call: any, callback: any) {
    try {
      let url = call.request.routerUrl;
      let moduleName: string | undefined = undefined;
      if (!url) {
        let result = this.conduit
          .getConfigManager()!
          .getModuleUrlByInstance(call.getPeer());
        if (!result) {
          return callback({
            code: status.INTERNAL,
            message: 'Error when registering routes',
          });
        }
        call.request.routerUrl = result.url;
        moduleName = result!.moduleName;
      }
      this.internalRegisterRoute(
        call.request.protoFile,
        call.request.routes,
        call.request.routerUrl,
        moduleName
      );
      this.updateState(
        call.request.protoFile,
        call.request.routes,
        call.request.routerUrl
      );
    } catch (err) {
      console.error(err);
      return callback({
        code: status.INTERNAL,
        message: 'Error when registering routes',
      });
    }
    callback(null, null);
  }

  registerRoute(route: ConduitRoute): void {
    this._sdkRoutes.push(route);
    this._restRouter.registerConduitRoute(route);
    this.cleanupRoutes();
  }

  private attachRouter() {
    this.conduit.getRouter().registerExpressRouter('/admin', (req, res, next) => {
      this._restRouter.handleRequest(req, res, next);
    });
  }

  private async highAvailability() {
    let r = await this.conduit.getState().getKey('admin');
    if (!r || r.length === 0) {
      this.cleanupRoutes();
      return;
    }
    let state = JSON.parse(r);
    if (state.routes) {
      state.routes.forEach((r: any) => {
        try {
          this.internalRegisterRoute(r.protofile, r.routes, r.url);
        } catch (err) {
          console.error(err);
        }
      }, this);
      console.log('Recovered routes');
    }
    this.cleanupRoutes();

    this.conduit.getBus().subscribe('admin', (message: string) => {
      let messageParsed = JSON.parse(message);
      try {
        this.internalRegisterRoute(
          messageParsed.protofile,
          messageParsed.routes,
          messageParsed.url
        );
      } catch (err) {
        console.error(err);
      }
      this.cleanupRoutes();
    });
  }

  private updateState(protofile: string, routes: any, url: string) {
    this.conduit
      .getState()
      .getKey('admin')
      .then((r: any) => {
        let state = !r || r.length === 0 ? {} : JSON.parse(r);
        if (!state.routes) state.routes = [];
        let index;
        (state.routes as any[]).forEach((val, i) => {
          if (val.url === url) {
            index = i;
          }
        });
        if (index) {
          state.routes[index] = { protofile, routes, url };
        } else {
          state.routes.push({
            protofile,
            routes,
            url,
          });
        }
        return this.conduit.getState().setKey('admin', JSON.stringify(state));
      })
      .then(() => {
        this.publishAdminRouteData(protofile, routes, url);
        console.log('Updated state');
      })
      .catch(() => {
        console.log('Failed to update state');
      });
  }

  private publishAdminRouteData(protofile: string, routes: any, url: string) {
    this.conduit.getBus().publish(
      'admin',
      JSON.stringify({
        protofile,
        routes,
        url,
      })
    );
  }

  private async handleDatabase() {
    if (!this.grpcSdk.databaseProvider) {
      await this.grpcSdk.waitForExistence('database');
    }
    const databaseAdapter = this.grpcSdk.databaseProvider!;

    await databaseAdapter.createSchemaFromAdapter(AdminSchema);

    databaseAdapter
      .findOne('Admin', { username: 'admin' })
      .then(async (existing: any) => {
        if (isNil(existing)) {
          const adminConfig = await this.conduit.getConfigManager().get('admin');
          const hashRounds = adminConfig.auth.hashRounds;
          return hashPassword('admin', hashRounds);
        }
        return Promise.resolve(null);
      })
      .then((result: string | null) => {
        if (!isNil(result)) {
          return databaseAdapter.create('Admin', { username: 'admin', password: result });
        }
      })
      .catch(console.log);
  }

  private internalRegisterRoute(
    protofile: any,
    routes: any[],
    url: any,
    moduleName?: string
  ) {
    let processedRoutes: (
      | ConduitRoute
      | ConduitMiddleware
      | ConduitSocket // can go
    )[] = grpcToConduitRoute(
      'Admin',
      {
        protoFile: protofile,
        routes: routes,
        routerUrl: url,
      },
      moduleName
    );

    processedRoutes.forEach((r) => {
      if (r instanceof ConduitRoute) {
        console.log(
          'New admin route registered: ' +
            r.input.action +
            ' ' +
            r.input.path +
            ' handler url: ' +
            url
        );
        this._restRouter.registerConduitRoute(r);
      }
    });
    this._grpcRoutes[url] = routes;
    this.cleanupRoutes();
  }

  private cleanupRoutes() {
    let routes: { action: string; path: string }[] = [];
    // Admin routes
    routes.push(
      { action: ConduitRouteActions.POST, path: '/login' },
      { action: ConduitRouteActions.GET, path: '/modules' }
    );
    // Package routes
    this._sdkRoutes.forEach((route: ConduitRoute) => {
      routes.push({ action: route.input.action, path: route.input.path });
    });
    // Module routes
    Object.keys(this._grpcRoutes).forEach((grpcRoute: string) => {
      let routesArray = this._grpcRoutes[grpcRoute];
      routes.push(
        ...routesArray.map((route: any) => {
          return { action: route.options.action, path: route.options.path };
        })
      );
    });
    this._restRouter.cleanupRoutes(routes);
  }
}
