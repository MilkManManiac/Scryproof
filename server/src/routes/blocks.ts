/**
 * Your own list of blocked people.
 *
 * Only ever about the person asking. There is no route here that says whether
 * somebody has blocked you, because being told would be the one thing
 * blocking is supposed not to do: it is private, and the person blocked is not
 * informed. What the rest of the server does with the list is in
 * `services/blocks.ts`.
 *
 * Reading the list gives names, because it is shown to somebody. Blocking and
 * unblocking give back the ids, because that is what the client keeps.
 */

import type { FastifyInstance } from 'fastify';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import type { BlockedPerson } from '@scryproof/shared';

import { requireUser } from '../app.js';
import { getDb } from '../db/index.js';
import { blocks, users } from '../db/schema.js';
import { badRequest, notFound } from '../lib/http-error.js';
import { blockedBy } from '../services/blocks.js';
import { sharesAServer } from '../services/servers.js';

const targetShape = z.object({ userId: z.string().min(1).max(64) });

export async function registerBlockRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/blocks', async (request) => {
    const user = requireUser(request);
    const ids = await blockedBy(user.id);
    if (ids.length === 0) return { blocks: [] as BlockedPerson[] };

    const rows = await getDb()
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(inArray(users.id, ids));
    // By name, because the list is read rather than counted.
    const list: BlockedPerson[] = rows.sort((a, b) =>
      a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }),
    );
    return { blocks: list };
  });

  app.put('/api/blocks/:userId', async (request) => {
    const user = requireUser(request);
    const { userId } = targetShape.parse(request.params);
    if (userId === user.id) throw badRequest('That is you.', 'block_self');
    // The same answer the direct message route gives about a stranger, and for
    // the same reason: this must not become a way to ask who has an account.
    if (!(await sharesAServer(user.id, userId))) {
      throw notFound('That person does not exist.', 'unknown_user');
    }

    await getDb().insert(blocks).values({ userId: user.id, blockedId: userId }).onConflictDoNothing();
    // The whole list back, not just the one id: the client replaces what it
    // holds rather than reconciling, so a lost response cannot leave it wrong.
    return { blocks: await blockedBy(user.id) };
  });

  app.delete('/api/blocks/:userId', async (request) => {
    const user = requireUser(request);
    const { userId } = targetShape.parse(request.params);
    await getDb()
      .delete(blocks)
      .where(and(eq(blocks.userId, user.id), eq(blocks.blockedId, userId)));
    return { blocks: await blockedBy(user.id) };
  });
}
