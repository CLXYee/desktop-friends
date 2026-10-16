import { describe, expect, it } from 'vitest';
import { parseEventBlock } from '../src/renderer/services/eventStream';

describe('event stream parsing', () => {
  it('reads a named event with JSON data', () => {
    expect(parseEventBlock('event:presence\ndata:{"userId":"u1","presence":"online","lastSeenAt":null}'))
      .toEqual({ name: 'presence', data: { userId: 'u1', presence: 'online', lastSeenAt: null } });
  });

  it('accepts a space after the colon and data split over lines', () => {
    expect(parseEventBlock('event: groups\ndata: {"a":\ndata: 1}')).toEqual({ name: 'groups', data: { a: 1 } });
  });

  it('skips keep-alive comments', () => {
    expect(parseEventBlock(':keep-alive')).toBeNull();
  });

  it('hands over data that is not JSON as text', () => {
    expect(parseEventBlock('event:note\ndata:hello')).toEqual({ name: 'note', data: 'hello' });
  });
});
