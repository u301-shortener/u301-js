import { describe, expect, it } from 'bun:test';
import { toU301Error } from './errors';

describe('toU301Error', () => {
    it('extracts nested validation issue messages from api responses', () => {
        const error = toU301Error({
            status: 400,
            _data: {
                success: false,
                error: {
                    issues: [
                        {
                            path: ['shortCodeLength'],
                            message: 'Expected number, received nan',
                        },
                    ],
                    name: 'ZodError',
                },
            },
        });

        expect(error.message).toBe('shortCodeLength: Expected number, received nan');
    });
});
