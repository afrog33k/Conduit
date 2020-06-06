
export default {
    auth: {
        tokenSecret: {
            type: String,
            default: 'fjeinqgwenf'
        },
        hashRounds: {
            type: Number,
            default: 11
        },
        tokenExpirationTime: {
            type: Number,
            default: 21600
        },
        masterkey: {
            type: String,
            default: 'M4ST3RK3Y'
        }
    }
};
