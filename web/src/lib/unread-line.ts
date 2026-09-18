/**
 * Where the "New" line goes, and how many messages are under it.
 *
 * Pure, and out here rather than inside the timeline, because this is the rule
 * that has to agree with the unread badge in the sidebar. When those two
 * disagree the client is telling a person two different things about the same
 * channel, and they will believe the wrong one.
 *
 * Three states, and the third is the one that gets missed:
 *
 *   undefined  nothing is known yet, before the read marks have arrived. Draw
 *              no line rather than a line in the wrong place.
 *   null       there is no read mark at all: this channel has never been read,
 *              so everything in it is new. This is exactly what the badge has
 *              been saying, and an empty read mark is the normal state of a
 *              channel somebody has not opened yet.
 *   an id      the ordinary case. Ids sort by time, so "after this one" is a
 *              string comparison and nothing has to be looked up.
 */

export interface UnreadLine {
  /** Index into the messages given, or -1 for no line. */
  index: number;
  /** How many of the messages from there on are somebody else's. */
  count: number;
}

export function unreadLine(input: {
  messages: readonly { id: string; authorId: string }[];
  selfId: string | null | undefined;
  /** `undefined` not known yet, `null` never read, otherwise the last read id. */
  lastReadMessageId: string | null | undefined;
}): UnreadLine {
  const { messages, selfId, lastReadMessageId } = input;
  if (lastReadMessageId === undefined) return { index: -1, count: 0 };

  // Your own message is never news, wherever you typed it. Someone who posts
  // from their phone and then opens their desktop has not missed anything.
  const isNew = (message: { id: string; authorId: string }) =>
    message.authorId !== selfId &&
    (lastReadMessageId === null || message.id > lastReadMessageId);

  const index = messages.findIndex(isNew);
  if (index === -1) return { index: -1, count: 0 };

  return {
    index,
    count: messages.slice(index).filter((message) => message.authorId !== selfId).length,
  };
}
