import { Logger } from '../utils/logger';
import { AppConfig } from './app.config';
const swaggerUi = require('swagger-ui-express');
import * as lowdb from 'lowdb';
import express from 'express';
import jsonServer = require('json-server');
import { StorageAdapter } from '../storage/storage';
import { ApiSpecification } from '../specifications/apispecification';
import { JSONValidator } from '../validations/json.validator';
import graphqlHTTP from 'express-graphql';
import { createSchema } from 'swagger-to-graphql';
import cors from 'cors';
import { GraphQLMethods } from '../utils/grapqhl_callback';
import { GraphQLSchema } from 'graphql';
import { Environment } from '../environment';
import bodyParser from 'body-parser';
import { Output } from '../utils/output';

export class CoreApp {
  private storageAdapter: StorageAdapter;
  private storage = {} as lowdb.AdapterAsync;
  private adapter = {} as lowdb.LowdbAsync<{}>;
  private swaggerSpec = null;
  private appConfig: AppConfig;
  protected server: express.Express;
  private apispec: ApiSpecification;
  private graphqlSchema: GraphQLSchema = null;
  private environment: Environment;
  constructor(
    appConfig: AppConfig,
    server: express.Express,
    storageAdapter: StorageAdapter,
    apispec: ApiSpecification,
    environment: Environment
  ) {
    this.appConfig = appConfig;
    this.server = server;
    this.storageAdapter = storageAdapter;
    this.apispec = apispec;
    this.environment = environment;
    Logger.getInstance().info(
      'environment: ' + JSON.stringify(this.environment)
    );
  }

  async setup(): Promise<void> {
    this.setupMiddleware();
    this.adapter = await this.setupStorage(this.storageAdapter);
    const json = await this.adapter.getState();
    if (this.validateJSON(json)) {
      const { middlewares, router } = await this.initializeLayers();
      await this.setupRoutes(json, middlewares, router);
    } else {
      Output.setError('provided json is not valid - see validation checks');
      throw Error('provided json is not valid - see validation checks');
    }
  }

  private setupMiddleware() {
    this.server.use(cors());
    this.server.use(bodyParser.json());
    this.server.use(bodyParser.urlencoded({ extended: true }));
  }

  protected async setupStorage(
    storageAdapter: StorageAdapter
  ): Promise<lowdb.LowdbAsync<any>> {
    this.storage = storageAdapter.init();
    const adapter = await lowdb.default(this.storage);
    return adapter;
  }

  protected validateJSON(db: {}): boolean {
    let isValid = true;
    if (this.appConfig.enableJSONValidation) {
      isValid = JSONValidator.validate(db);
    }
    return isValid;
  }

  protected async setupRoutes(db: {}, middlewares, router): Promise<void> {
    middlewares.splice(
      middlewares.findIndex(x => x.name === 'serveStatic'),
      1
    );
    this.server.use(middlewares);
    this.server.use('/api', router);
    if (!this.swaggerSpec) {
      this.swaggerSpec = this.apispec.generateSpecification(db, true);
      const swaggerSetupMiddleware = swaggerUi.setup(this.swaggerSpec);
      swaggerSetupMiddleware({}, { send: () => {} }, function(err: any): any {
        console.log(err);
      });
      this.graphqlSchema = await createSchema({
        swaggerSchema: this.swaggerSpec,
        callBackend: args => {
          return GraphQLMethods.callRestBackend(args);
        },
      });

      this.server.use('/graphql', (req, res) => {
        const graphqlFunc = graphqlHTTP({
          schema: this.graphqlSchema,
          graphiql: true,
          context:
            this.environment.basePath == '/'
              ? req.headers['origin']
              : req.headers['origin'] + this.environment.basePath,
        });
        return graphqlFunc(req, res);
      });

      this.server.use('/api-spec', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(this.swaggerSpec);
      });

      this.server.use('/ui', swaggerUi.serveWithOptions({ redirect: false }));
      this.server.use('/', swaggerUi.serveWithOptions({ redirect: false }));
      this.server.get('/ui', swaggerUi.setup(this.swaggerSpec));
    }
  }

  protected initializeLayers() {
    const router = jsonServer.router(this.adapter);
    const middlewares = jsonServer.defaults({
      readOnly: this.appConfig.readOnly,
    });
    return { middlewares, router };
  }
}
