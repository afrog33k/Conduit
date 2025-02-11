export default {
  teams: {
    enabled: {
      format: 'Boolean',
      default: false,
    },
    enableDefaultTeam: {
      format: 'Boolean',
      default: false,
    },
    invites: {
      enabled: {
        format: 'Boolean',
        default: false,
      },
      sendEmail: {
        format: 'Boolean',
        default: false,
      },
      inviteUrl: {
        format: 'String',
        default: 'https://mydomain.conduit/invite',
      },
    },
  },
};
