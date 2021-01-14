import {ConduitSDK, IConduitSecurity} from '@quintessential-sft/conduit-sdk';
import ConduitGrpcSdk from '@quintessential-sft/conduit-grpc-sdk';
import {Admin} from './admin';
import helmet from "helmet";
import {RateLimiter} from "./handlers/rate-limiter";
import {ClientValidator} from "./handlers/client-validation";

class SecurityModule extends IConduitSecurity {

    constructor(private readonly conduit: ConduitSDK, private readonly grpcSdk: ConduitGrpcSdk) {
        super(conduit);

        new Admin(conduit, grpcSdk);
        const router = conduit.getRouter();

        let clientValidator: ClientValidator = new ClientValidator(grpcSdk.databaseProvider!);

        router.registerGlobalMiddleware('rateLimiter', (new RateLimiter(process.env.REDIS_HOST as string,
            parseInt(process.env.REDIS_PORT as string))).limiter);
        router.registerGlobalMiddleware('helmetMiddleware', helmet());
        router.registerGlobalMiddleware('clientMiddleware', clientValidator.middleware.bind(clientValidator));
    }

}

export = SecurityModule;
