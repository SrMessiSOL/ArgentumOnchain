import config from '../config';
import {createInternalAuthorization} from '../internalServicePolicy';
export const requireAuth=createInternalAuthorization(config.tokenAuth,config.gameServiceToken);
