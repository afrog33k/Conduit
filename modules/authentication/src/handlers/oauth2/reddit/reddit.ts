import ConduitGrpcSdk from '@conduitplatform/grpc-sdk';
import axios from 'axios';
import { RedditUser } from './reddit.user';
import { OAuth2 } from '../OAuth2';
import { OAuth2Settings } from '../interfaces/OAuth2Settings';
import * as redditParameters from './reddit.json';
import { ProviderConfig } from '../interfaces/ProviderConfig';
import { Payload } from '../interfaces/Payload';
import { ConnectionParams } from '../interfaces/ConnectionParams';
import { AuthParams } from '../interfaces/AuthParams';

export class RedditHandlers extends OAuth2<RedditUser, OAuth2Settings> {
  constructor(grpcSdk: ConduitGrpcSdk, config: { reddit: ProviderConfig }) {
    super(grpcSdk, 'reddit', new OAuth2Settings(config.reddit, redditParameters));
    this.defaultScopes = ['identity'];
  }

  async connectWithProvider(details: ConnectionParams): Promise<Payload<RedditUser>> {
    const reddit_access_token = details.accessToken;
    const redditProfile = await axios.get('https://oauth.reddit.com/api/v1/me', {
      headers: {
        Authorization: `bearer ${reddit_access_token}`,
      },
    });
    return {
      id: redditProfile.data.id,
      email: redditProfile.data.email,
      data: { ...redditProfile.data },
    };
  }

  makeRequest(data: AuthParams) {
    return {
      method: this.settings.accessTokenMethod,
      url: this.settings.tokenUrl,
      data: `grant_type=${data.grant_type}&code=${data.code}&redirect_uri=${data.redirect_uri}`,
      headers: {
        authorization: `Basic ${Buffer.from(
          this.settings.clientId + ':' + this.settings.clientSecret,
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
  }
}
