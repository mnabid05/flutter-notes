import { defineAgent } from 'eve';
import { models } from './models';
// Filesystem agent definition for evolving the companion into durable eve sessions.
// The notebook HTTP adapter currently uses bounded, cancellable AI SDK calls.
export default defineAgent({ model: models.reason });
