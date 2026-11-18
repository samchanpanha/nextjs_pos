import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../data/seedData';
import { parseVoiceOrderTranscript } from './voiceOrderParser';
import { buildVoiceReviewDrafts, summarizeVoiceReviewDrafts } from './voiceCommandReview';

describe('voiceCommandReview utilities', () => {
  const seed = createSeedState('restaurant');
  const menu = seed.menuItems.filter((m) => m.branchId === 'branch_bkk1');

  it('stages recognized voice items for explicit confirmation and supports qty edits & removal', () => {
    const parsed = parseVoiceOrderTranscript(
      '2 iced coffee less ice and 1 beef lok lak',
      menu
    );
    const initialDrafts = buildVoiceReviewDrafts(parsed.matched);
    assert.equal(initialDrafts.length, 2);

    const summary1 = summarizeVoiceReviewDrafts(initialDrafts);
    assert.equal(summary1.totalUnits, 3);
    assert.equal(summary1.requiresConfirmation, true);
    assert.ok(summary1.estimatedTotalUsd > 0);

    // Increase first item qty to 4 and remove second item before pressing Confirm
    const firstKey = initialDrafts[0].draftId;
    const secondKey = initialDrafts[1].draftId;
    const editedDrafts = buildVoiceReviewDrafts(
      parsed.matched,
      { [firstKey]: 4 },
      new Set([secondKey])
    );

    assert.equal(editedDrafts.length, 1);
    assert.equal(editedDrafts[0].qty, 4);
    const summary2 = summarizeVoiceReviewDrafts(editedDrafts);
    assert.equal(summary2.distinctItems, 1);
    assert.equal(summary2.totalUnits, 4);
  });
});
