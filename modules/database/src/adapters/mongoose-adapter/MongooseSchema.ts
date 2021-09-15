import { Model, Mongoose, Schema } from 'mongoose';
import { SchemaAdapter } from '../../interfaces';
import { MongooseAdapter } from './index';
import { ConduitSchema } from '@quintessential-sft/conduit-grpc-sdk';
import { createWithPopulations } from './utils';
import { EJSON } from 'bson';

export class MongooseSchema implements SchemaAdapter {
  model: Model<any>;
  originalSchema: ConduitSchema;

  constructor(
    mongoose: Mongoose,
    schema: ConduitSchema,
    deepPopulate: any,
    private readonly adapter: MongooseAdapter
  ) {
    this.originalSchema = schema;
    let mongooseSchema = new Schema(schema.modelSchema as any, schema.modelOptions);
    mongooseSchema.plugin(deepPopulate, {});
    this.model = mongoose.model(schema.name, mongooseSchema);
  }

  async create(query: any): Promise<any> {
    query = EJSON.parse(query);
    query.createdAt = new Date();
    query.updatedAt = new Date();
    await this.createWithPopulations(query);
    return this.model.create(query).then((r) => r.toObject());
  }

  async createMany(query: any): Promise<any> {
    let docs: any = EJSON.parse(query);
    let date = new Date();
    for (let doc of docs) {
      doc.createdAt = date;
      doc.updatedAt = date;
      await this.createWithPopulations(doc);
    }

    return this.model.insertMany(docs).then((r) => r);
  }

  async findByIdAndUpdate(
    id: string,
    query: any,
    updateProvidedOnly: boolean = false
  ): Promise<any> {
    query = EJSON.parse(query);
    query['updatedAt'] = new Date();
    await this.createWithPopulations(query);
    if (updateProvidedOnly) {
      query = {
        $set: query,
      };
    }
    return this.model.findByIdAndUpdate(id, query, { new: true }).lean().exec();
  }

  async updateMany(
    filterQuery: any,
    query: any,
    updateProvidedOnly: boolean = false
  ): Promise<any> {
    filterQuery = EJSON.parse(filterQuery);
    query = EJSON.parse(query);
    await this.createWithPopulations(query);
    if (updateProvidedOnly) {
      query = {
        $set: query,
      };
    }
    return this.model.updateMany(this.parseQuery(filterQuery), query).exec();
  }

  deleteOne(query: any): Promise<any> {
    query = EJSON.parse(query);
    return this.model.deleteOne(this.parseQuery(query)).exec();
  }

  deleteMany(query: any): Promise<any> {
    query = EJSON.parse(query);
    return this.model.deleteMany(this.parseQuery(query)).exec();
  }

  calculatePopulates(queryObj: any, population: string[]) {
    population.forEach((r: any, index: number) => {
      let final = r.toString().trim();
      if (r.indexOf('.') !== -1) {
        r = final.split('.');
        let controlBool = true;
        while (controlBool) {
          if (this.originalSchema.modelSchema[r[0]]) {
            controlBool = false;
          } else if (r[0] === undefined || r[0].length === 0 || r[0] === '') {
            throw new Error("Failed populating '" + final + "'");
          } else {
            r.splice(0, 1);
          }
        }
        population[index] = r.join('.');
      }
    });
    // @ts-ignore
    queryObj = queryObj.deepPopulate(population);

    return queryObj;
  }

  findMany(
    query: any,
    skip?: number,
    limit?: number,
    select?: string,
    sort?: string,
    populate?: string[]
  ): Promise<any> {
    query = EJSON.parse(query);
    let finalQuery = this.model.find(this.parseQuery(query), select);
    if (skip !== null) {
      finalQuery = finalQuery.skip(skip!);
    }
    if (limit !== null) {
      finalQuery = finalQuery.limit(limit!);
    }
    if (populate != null) {
      finalQuery = this.calculatePopulates(finalQuery, populate);
    }
    if (sort !== null) {
      finalQuery = finalQuery.sort(sort);
    }
    // } else {
    //   finalQuery = finalQuery.sort({ createdAt: -1 });
    // }
    return finalQuery.lean().exec();
  }

  findOne(query: any, select?: string, populate?: string[]): Promise<any> {
    query = EJSON.parse(query);
    let finalQuery = this.model.findOne(this.parseQuery(query), select);
    if (populate !== undefined && populate !== null) {
      finalQuery = this.calculatePopulates(finalQuery, populate);
    }
    return finalQuery.lean().exec();
  }

  countDocuments(query: any) {
    query = EJSON.parse(query);
    return this.model.find(this.parseQuery(query)).countDocuments().exec();
  }

  private async createWithPopulations(document: any): Promise<any> {
    return createWithPopulations(this.originalSchema.fields, document, this.adapter);
  }

  private parseQuery(query: any) {
    let parsed: any = {};

    Object.keys(query).forEach((key) => {
      if (query[key]?.hasOwnProperty('$contains')) {
        parsed[key] = { $in: query[key]['$contains'] };
      } else {
        parsed[key] = query[key];
      }
    });

    return parsed;
  }
}
