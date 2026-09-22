import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { parseInvitePath } from '../lib/invite-link';

describe('parseInvitePath', () => {
  it('reads the code out of an invite link', () => {
    assert.equal(parseInvitePath('/invite/ab12cd34'), 'ab12cd34');
  });

  it('lowercases the code', () => {
    assert.equal(parseInvitePath('/invite/AB12CD34'), 'ab12cd34');
  });

  it('ignores everything else', () => {
    assert.equal(parseInvitePath('/'), null);
    assert.equal(parseInvitePath('/join/ab12cd34'), null);
    assert.equal(parseInvitePath('/invite/'), null);
    assert.equal(parseInvitePath('/invite/ab12cd34/extra'), null);
    assert.equal(parseInvitePath('invite/ab12cd34'), null);
    assert.equal(parseInvitePath('/invite/has a space'), null);
  });
});
