import { api } from '../api/client'
import { PushLifecycle } from './lifecycle'
export const pushSession = new PushLifecycle(api.registerPush, api.deregisterPush)
