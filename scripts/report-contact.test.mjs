import test from 'node:test';
import assert from 'node:assert/strict';
import { reportContactHref } from '../src/lib/reportContact.ts';

test('submitted digits keep their leading zero and use only a tel target', () => {
  assert.equal(reportContactHref('09000000000'), 'tel:09000000000');
  // Match the existing form's 1–11-digit acceptance; do not change submission validation.
  assert.equal(reportContactHref('1'), 'tel:1');
  assert.equal(reportContactHref(' 09000000000 '), 'tel:09000000000');
});
test('legacy display formatting is preserved by callers but removed from the target', () => {
  assert.equal(reportContactHref('+63 (900) 000-0000'), 'tel:+639000000000');
  assert.equal(reportContactHref('(032) 000-0000'), 'tel:0320000000');
});
test('missing, unsupported or URI-like report text never becomes a guessed phone number', () => {
  for (const phone of [null, undefined, '', 'Not provided', 'javascript:alert(911)', '<script>911</script>',
    'tel:09000000000', '09000000000;ext=911', '09000000000,911', '*123#', '+63+9000000000',
    '09000000000/09000000001', '1234567890123456', '0'.repeat(100)]) assert.equal(reportContactHref(phone), null);
});
