// Expands an HTML table into a rectangular grid, resolving rowspan and colspan
// so every logical row has one cell reference per column. Wikipedia release
// lists lean heavily on rowspans (shared platforms, shared publishers), so the
// naive "nth td" approach silently shifts columns.

export function expandTable($, table) {
  const grid = [];
  const carry = []; // carry[col] = { el, left } for cells spilling down from rowspans

  $(table)
    .find('> tbody > tr, > tr, > thead > tr')
    .each((_, tr) => {
      const row = [];
      const cells = $(tr).children('td, th').toArray();
      let col = 0;
      const fillCarried = () => {
        while (carry[col] && carry[col].left > 0) {
          row[col] = carry[col].el;
          carry[col].left -= 1;
          col += 1;
        }
      };
      for (const cell of cells) {
        fillCarried();
        const colspan = clampSpan($(cell).attr('colspan'));
        const rowspan = clampSpan($(cell).attr('rowspan'));
        for (let k = 0; k < colspan; k++) {
          row[col + k] = cell;
          if (rowspan > 1) carry[col + k] = { el: cell, left: rowspan - 1 };
        }
        col += colspan;
      }
      fillCarried();
      grid.push(row);
    });

  return grid;
}

function clampSpan(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 && n < 500 ? n : 1;
}

// Plain text of a cell with footnote markers, edit links and hidden sort keys removed.
export function cellText($, el) {
  if (!el) return '';
  const clone = $(el).clone();
  clone.find('sup.reference, .mw-editsection, style, .sortkey, [style*="display:none"]').remove();
  clone.find('br').replaceWith(' ');
  return clone.text().replace(/\s+/g, ' ').trim();
}

export function isHeaderRow($, row) {
  return row.length > 0 && row.every((el) => el && el.tagName === 'th');
}
