import * as models from "./models";
// import {AuthMiddleware} from './middleware/auth';
import { AdminHandlers } from "./admin/admin";
import AuthenticationConfigSchema from "./config";
import { isNil } from "lodash";
import ConduitGrpcSdk, { grpcModule } from "@quintessential-sft/conduit-grpc-sdk";
import path from "path";
import * as grpc from "grpc";
import { AuthenticationRoutes } from "./routes/Routes";

let protoLoader = require("@grpc/proto-loader");

export default class AuthenticationModule {
  private database: any;
  private _admin: AdminHandlers;
  private isRunning: boolean = false;
  private _url: string;
  private _router: AuthenticationRoutes;
  private readonly grpcServer: any;

  constructor(private readonly grpcSdk: ConduitGrpcSdk) {
    const packageDefinition = protoLoader.loadSync(path.resolve(__dirname, "./authentication.proto"), {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const protoDescriptor = grpcModule.loadPackageDefinition(packageDefinition);

    const authentication = protoDescriptor.authentication.Authentication;
    this.grpcServer = new grpcModule.Server();

    this.grpcServer.addService(authentication.service, {
      setConfig: this.setConfig.bind(this),
    });

    this._url = process.env.SERVICE_URL || "0.0.0.0:0";
    let result = this.grpcServer.bind(this._url, grpcModule.ServerCredentials.createInsecure(), {
      "grpc.max_receive_message_length": 1024 * 1024 * 100,
      "grpc.max_send_message_length": 1024 * 1024 * 100
    });
    this._url = process.env.SERVICE_URL || "0.0.0.0:" + result;
    console.log("bound on:", this._url);

    this.grpcSdk
      .waitForExistence("database-provider")
      .then(() => {
        return this.grpcSdk.initializeEventBus();
      })
      .then(() => {
        this.grpcSdk.bus?.subscribe("authentication", (message: string) => {
          if (message === "config-update") {
            this.enableModule()
              .then(() => {
                console.log("Updated authentication configuration");
              })
              .catch(() => {
                console.log("Failed to update email config");
              });
          }
        });
        this.grpcSdk.bus?.subscribe("email-provider", (message: string) => {
            if (message === "enabled") {
              this.enableModule()
                .then(() => {
                  console.log("Updated authentication configuration");
                })
                .catch(() => {
                  console.log("Failed to update email config");
                });
            }
          });
      })
      .catch(() => {
        console.log("Bus did not initialize!");
      })
      .then(() => {
        return this.grpcSdk.config.get("authentication");
      })
      .catch(() => {
        return this.grpcSdk.config.updateConfig(AuthenticationConfigSchema.getProperties(), "authentication");
      })
      .then(() => {
        return this.grpcSdk.config.addFieldstoConfig(AuthenticationConfigSchema.getProperties(), "authentication");
      })
      .catch(() => {
        console.log("authentication config did not update");
      })
      .then((authConfig: any) => {
        if (authConfig.active) {
          return this.enableModule();
        }
      })
      .catch(console.log);
  }

  get url(): string {
    return this._url;
  }

  async setConfig(call: any, callback: any) {
    const newConfig = JSON.parse(call.request.newConfig);
    if (!AuthenticationConfigSchema.load(newConfig).validate()) {
      return callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid configuration values" });
    }

    let errorMessage: string | null = null;
    const updateResult = await this.grpcSdk.config
      .updateConfig(newConfig, "authentication")
      .catch((e: Error) => (errorMessage = e.message));
    if (!isNil(errorMessage)) {
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }

    const authenticationConfig = await this.grpcSdk.config.get("authentication");
    if (authenticationConfig.active) {
      await this.enableModule().catch((e: Error) => (errorMessage = e.message));
      if (!isNil(errorMessage)) return callback({ code: grpc.status.INTERNAL, message: errorMessage });
      this.grpcSdk.bus?.publish("authentication", "config-update");
    } else {
      return callback({ code: grpc.status.FAILED_PRECONDITION, message: "Module is not active" });
    }
    if (!isNil(errorMessage)) {
      return callback({ code: grpc.status.INTERNAL, message: errorMessage });
    }

    return callback(null, { updatedConfig: JSON.stringify(updateResult) });
  }

  private async enableModule() {
    if (!this.isRunning) {
      this.database = this.grpcSdk.databaseProvider;
      this._admin = new AdminHandlers(this.grpcServer, this.grpcSdk);
      await this.registerSchemas();
      this._router = new AuthenticationRoutes(this.grpcServer, this.grpcSdk);
      this.grpcServer.start();
      this.isRunning = true;
    }
    await this._router.registerRoutes();
  }

  private registerSchemas() {
    const promises = Object.values(models).map((model) => {
      return this.database.createSchemaFromAdapter(model);
    });
    return Promise.all(promises);
  }
}
