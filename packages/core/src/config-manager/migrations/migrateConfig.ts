import { Config } from '../models';

export async function migrateConfig() {
  const configs: any[] = await Config.getInstance().findMany({});
  if (configs.length === 0 || configs.length > 1) return;
  const id = configs[0]._id;
  for (const [moduleName, newConfig] of Object.entries(configs[0].moduleConfigs)) {
    await Config.getInstance().create({ name: moduleName, config: newConfig });
  }
  await Config.getInstance().deleteOne({ _id: id });
}
