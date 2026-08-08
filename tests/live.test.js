import test from 'node:test';
import assert from 'node:assert/strict';
import {NotebookLmBrowserAdapter} from '../dist/browser-adapter.js';

test('LIVE NotebookLM health and enumeration (explicit opt-in)',{skip:!process.env.NLM_LIVE_TEST},async()=>{const adapter=new NotebookLmBrowserAdapter();const health=await adapter.health();assert.equal(health.ok,true,health.detail);const notebooks=await adapter.listNotebooks();assert.ok(Array.isArray(notebooks));await adapter.shutdown();});
