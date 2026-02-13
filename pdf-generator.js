/* ===================================================
   PDF Generator - jsPDF を使用した請求書PDF生成
   サンプルPDFのレイアウトを再現
   =================================================== */

// フォントロード状態
let fontLoaded = false;
let fontLoadPromise = null;

async function loadJapaneseFont(doc) {
  if (fontLoaded && window._fontRegularB64) {
    doc.addFileToVFS('MPLUS1p-Regular.ttf', window._fontRegularB64);
    doc.addFont('MPLUS1p-Regular.ttf', 'MPLUS1p', 'normal');
    if (window._fontBoldB64) {
      doc.addFileToVFS('MPLUS1p-Bold.ttf', window._fontBoldB64);
      doc.addFont('MPLUS1p-Bold.ttf', 'MPLUS1p', 'bold');
    }
    return true;
  }

  if (!fontLoadPromise) {
    fontLoadPromise = (async () => {
      // ローカル同梱のTTFフォントを読み込む
      const fontSources = [
        {
          name: 'Local MPLUS1p',
          regularUrl: 'MPLUS1p-Regular.ttf',
          boldUrl: 'MPLUS1p-Bold.ttf'
        },
        {
          name: 'MPLUS1p (jsdelivr CDN)',
          regularUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mplus1p/MPLUS1p-Regular.ttf',
          boldUrl: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mplus1p/MPLUS1p-Bold.ttf'
        },
        {
          name: 'Koruri (jsdelivr CDN)',
          regularUrl: 'https://cdn.jsdelivr.net/gh/Koruri/Koruri@master/Koruri-Regular.ttf',
          boldUrl: null
        }
      ];

      for (const source of fontSources) {
        try {
          console.log('[PDF] Trying font source:', source.name);

          const regularRes = await fetch(source.regularUrl);
          if (!regularRes.ok) throw new Error('HTTP ' + regularRes.status);
          const regularBuf = await regularRes.arrayBuffer();

          if (regularBuf.byteLength < 100000) {
            throw new Error('Font too small: ' + regularBuf.byteLength + ' bytes');
          }

          console.log('[PDF] Regular font downloaded:', (regularBuf.byteLength / 1024 / 1024).toFixed(2), 'MB');

          // base64変換
          const regularB64 = uint8ToBase64(new Uint8Array(regularBuf));

          // Bold (optional)
          let boldB64 = null;
          if (source.boldUrl) {
            try {
              const boldRes = await fetch(source.boldUrl);
              if (boldRes.ok) {
                const boldBuf = await boldRes.arrayBuffer();
                if (boldBuf.byteLength > 100000) {
                  boldB64 = uint8ToBase64(new Uint8Array(boldBuf));
                }
              }
            } catch (e) {
              console.warn('[PDF] Bold font skipped:', e.message);
            }
          }

          window._fontRegularB64 = regularB64;
          window._fontBoldB64 = boldB64;
          fontLoaded = true;
          console.log('[PDF] Font loaded OK from:', source.name);
          return;
        } catch (e) {
          console.warn('[PDF] Font source failed:', source.name, '-', e.message);
        }
      }

      throw new Error('All font sources failed');
    })();
  }

  try {
    await fontLoadPromise;
  } catch (e) {
    fontLoadPromise = null;
    fontLoaded = false;
    throw e;
  }

  doc.addFileToVFS('MPLUS1p-Regular.ttf', window._fontRegularB64);
  doc.addFont('MPLUS1p-Regular.ttf', 'MPLUS1p', 'normal');
  if (window._fontBoldB64) {
    doc.addFileToVFS('MPLUS1p-Bold.ttf', window._fontBoldB64);
    doc.addFont('MPLUS1p-Bold.ttf', 'MPLUS1p', 'bold');
  }
  return true;
}

// ArrayBuffer → base64
function uint8ToBase64(uint8) {
  let result = '';
  const len = uint8.length;
  for (let i = 0; i < len; i++) {
    result += String.fromCharCode(uint8[i]);
  }
  return btoa(result);
}

// ===== メインPDF生成関数 =====
async function generateInvoicePDF(invoice, settings) {
  if (!window.jspdf) {
    showToast('jsPDFライブラリが読み込まれていません。ページを再読み込みしてください。', 'error');
    throw new Error('jsPDF not loaded');
  }

  showToast('PDF生成中...', 'info');

  // まず日本語フォント付きで試行
  try {
    await buildPDF(invoice, settings, true);
    return;
  } catch (err) {
    console.error('[PDF] Japanese font PDF failed:', err);
  }

  // 失敗時: 標準フォント (helvetica) でフォールバック
  try {
    showToast('日本語フォント読込失敗。標準フォントで生成中...', 'info');
    await buildPDF(invoice, settings, false);
  } catch (err2) {
    console.error('[PDF] Fallback PDF also failed:', err2);
    showToast('PDF生成に失敗しました: ' + err2.message, 'error');
    throw err2;
  }
}

async function buildPDF(invoice, settings, tryJapanese) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  let fontName = 'helvetica';
  let hasBold = true;

  if (tryJapanese) {
    await loadJapaneseFont(doc);
    const fl = doc.getFontList();
    if (fl['MPLUS1p']) {
      fontName = 'MPLUS1p';
      hasBold = !!(fl['MPLUS1p'] && fl['MPLUS1p'].indexOf('bold') >= 0);
    } else {
      throw new Error('Font not registered');
    }
  }

  const pageWidth = 210;
  const pageHeight = 297;
  const marginLeft = 20;
  const contentWidth = pageWidth - marginLeft - 20;

  const setFont = (style, size) => {
    try {
      if (style === 'bold' && fontName !== 'helvetica' && !hasBold) {
        doc.setFont(fontName, 'normal');
      } else {
        doc.setFont(fontName, style);
      }
    } catch(e) {
      doc.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
    }
    doc.setFontSize(size);
  };

  const drawLine = (x1, y1, x2, y2, w) => {
    doc.setLineWidth(w || 0.3);
    doc.setDrawColor(0);
    doc.line(x1, y1, x2, y2);
  };

  const fmtN = (n) => Number(n).toLocaleString('ja-JP');

  // ===== PAGE 1 =====
  let y = 25;

  // タイトル
  setFont('bold', 22);
  doc.text('\u8ACB\u6C42\u66F8', pageWidth / 2, y, { align: 'center' });
  y += 18;

  // 宛先
  setFont('bold', 14);
  doc.text((invoice.customerName || '') + ' \u69D8', marginLeft, y);

  // 右側情報
  const rc = 130;
  setFont('normal', 9);
  doc.text('\u8ACB\u6C42\u65E5', rc, y - 6);
  doc.text(invoice.invoiceDate || '', rc + 30, y - 6);
  doc.text('\u8ACB\u6C42\u66F8\u756A\u53F7', rc, y);
  doc.text(invoice.invoiceNumber || '', rc + 30, y);
  doc.text('\u767B\u9332\u756A\u53F7', rc, y + 6);
  doc.text(settings.registrationNumber || '', rc + 30, y + 6);

  y += 20;

  // 会社情報
  const cx = 135;
  setFont('bold', 10);
  doc.text(settings.companyName || '', cx, y);

  if (settings.logoImage) {
    try {
      const fmt = settings.logoImage.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(settings.logoImage, fmt, 175, y - 8, 18, 18);
    } catch (e) { /* skip */ }
  }

  setFont('normal', 9);
  y += 5;
  doc.text(settings.representativeName || '', cx, y);
  y += 5;
  doc.text(settings.postalCode || '', cx, y);
  y += 5;
  doc.text(settings.address || '', cx, y);
  y += 5;

  setFont('normal', 10);
  doc.text('\u4E0B\u8A18\u306E\u901A\u308A\u3054\u8ACB\u6C42\u7533\u3057\u4E0A\u3052\u307E\u3059\u3002', marginLeft, y);
  y += 7;

  // 件名
  setFont('bold', 11);
  doc.text('\u4EF6\u540D', marginLeft, y);
  setFont('normal', 11);
  doc.text(invoice.subject || '', marginLeft + 20, y);
  y += 5;

  // === サマリーボックス（小計/消費税/請求金額） ===
  // 表幅をcontentWidthの2/3に、左詰め
  const summaryW = Math.round(contentWidth * 3 / 5);
  const sColW = Math.round(summaryW / 3);
  const sy = y;
  const summaryH = 14;

  // 外枠上
  drawLine(marginLeft, sy, marginLeft + summaryW, sy);
  // ヘッダー行
  setFont('normal', 8);
  const sCol1Mid = marginLeft + sColW / 2;
  const sCol2Mid = marginLeft + sColW + sColW / 2;
  const sCol3Mid = marginLeft + sColW * 2 + sColW / 2;
  doc.text('\u5C0F\u8A08', sCol1Mid, sy + 4.5, { align: 'center' });
  doc.text('\u6D88\u8CBB\u7A0E', sCol2Mid, sy + 4.5, { align: 'center' });
  doc.text('\u8ACB\u6C42\u91D1\u984D', sCol3Mid, sy + 4.5, { align: 'center' });
  // ヘッダー下線
  drawLine(marginLeft, sy + 6, marginLeft + summaryW, sy + 6);

  // 金額行（中央寄せ）
  setFont('normal', 9);
  doc.text(fmtN(invoice.subtotal) + '\u5186', sCol1Mid, sy + 11, { align: 'center' });
  doc.text(fmtN(invoice.tax) + '\u5186', sCol2Mid, sy + 11, { align: 'center' });
  setFont('bold', 13);
  doc.text(fmtN(invoice.total) + '\u5186', sCol3Mid, sy + 11.5, { align: 'center' });

  // 縦線
  drawLine(marginLeft + sColW, sy, marginLeft + sColW, sy + summaryH);
  drawLine(marginLeft + sColW * 2, sy, marginLeft + sColW * 2, sy + summaryH);
  // 左右外枠
  drawLine(marginLeft, sy, marginLeft, sy + summaryH);
  drawLine(marginLeft + summaryW, sy, marginLeft + summaryW, sy + summaryH);
  // 外枠下
  drawLine(marginLeft, sy + summaryH, marginLeft + summaryW, sy + summaryH);

  y = sy + summaryH + 2;

  // === 入金期日・振込先（同じ幅に揃える） ===
  const py = y;
  const payW = summaryW;
  const dueDateColW = 35;

  // 外枠上
  drawLine(marginLeft, py, marginLeft + payW, py);
  // ヘッダー行
  setFont('normal', 8);
  doc.text('\u5165\u91D1\u671F\u65E5', marginLeft + dueDateColW / 2, py + 4.5, { align: 'center' });
  doc.text('\u632F\u8FBC\u5148', marginLeft + dueDateColW + (payW - dueDateColW) / 2, py + 4.5, { align: 'center' });
  // ヘッダー下線
  drawLine(marginLeft, py + 6, marginLeft + payW, py + 6);
  // 入金期日と振込先の縦仕切り（ヘッダー行のみ）
  drawLine(marginLeft + dueDateColW, py, marginLeft + dueDateColW, py + 6);

  // 入金期日
  setFont('normal', 9);
  doc.text(invoice.dueDate || '', marginLeft + dueDateColW / 2, py + 11, { align: 'center' });

  // 振込先
  setFont('normal', 7.5);
  let bankY = py + 10;
  (settings.bankAccounts || []).forEach(bank => {
    doc.text(bank.bankName + ' ' + bank.branchName, marginLeft + dueDateColW + 3, bankY);
    bankY += 3.5;
    doc.text('\u3000' + bank.accountType + ' ' + bank.accountNumber + ' ' + bank.accountHolder, marginLeft + dueDateColW + 3, bankY);
    bankY += 4;
  });

  const payEndY = Math.max(py + 14, bankY);
  // 下の縦仕切り（データ行）
  drawLine(marginLeft + dueDateColW, py + 6, marginLeft + dueDateColW, payEndY);
  // 左右外枠
  drawLine(marginLeft, py, marginLeft, payEndY);
  drawLine(marginLeft + payW, py, marginLeft + payW, payEndY);
  // 外枠下
  drawLine(marginLeft, payEndY, marginLeft + payW, payEndY);

  y = payEndY + 6;

  // ===== 明細テーブル =====
  const items = invoice.items || [];
  const colDesc = marginLeft;
  const colQty = marginLeft + 100;
  const colPrice = marginLeft + 125;
  const colAmount = marginLeft + 155;
  const tableRight = marginLeft + contentWidth;
  const rowH = 7;
  const headerH = 8;

  let totalPages = 1;
  let itemIdx = 0;

  function drawTableHeader(yPos) {
    setFont('bold', 8);
    doc.setFillColor(245, 245, 245);
    doc.rect(colDesc, yPos, contentWidth, headerH, 'F');
    drawLine(colDesc, yPos, tableRight, yPos);
    doc.text('\u6458\u8981', colDesc + 3, yPos + 5.5);
    doc.text('\u6570\u91CF', colQty + 3, yPos + 5.5);
    doc.text('\u5358\u4FA1', colPrice + 3, yPos + 5.5);
    doc.text('\u660E\u7D30\u91D1\u984D', colAmount + 3, yPos + 5.5);
    drawLine(colQty, yPos, colQty, yPos + headerH);
    drawLine(colPrice, yPos, colPrice, yPos + headerH);
    drawLine(colAmount, yPos, colAmount, yPos + headerH);
    drawLine(colDesc, yPos, colDesc, yPos + headerH);
    drawLine(tableRight, yPos, tableRight, yPos + headerH);
    drawLine(colDesc, yPos + headerH, tableRight, yPos + headerH);
    return yPos + headerH;
  }

  function drawTableRow(yPos, item) {
    setFont('normal', 9);
    const qtyText = String(item.quantity) + (item.unit ? ' ' + item.unit : '');
    let desc = item.description || '';
    const maxW = colQty - colDesc - 6;
    while (desc.length > 1 && doc.getTextWidth(desc) > maxW) {
      desc = desc.slice(0, -1);
    }
    doc.text(desc, colDesc + 3, yPos + 5);
    doc.text(qtyText, colQty + 3, yPos + 5);
    doc.text(fmtN(item.unitPrice), colPrice + 3, yPos + 5);
    doc.text(fmtN(item.amount), tableRight - 3, yPos + 5, { align: 'right' });
    drawLine(colDesc, yPos, colDesc, yPos + rowH);
    drawLine(colQty, yPos, colQty, yPos + rowH);
    drawLine(colPrice, yPos, colPrice, yPos + rowH);
    drawLine(colAmount, yPos, colAmount, yPos + rowH);
    drawLine(tableRight, yPos, tableRight, yPos + rowH);
    drawLine(colDesc, yPos + rowH, tableRight, yPos + rowH);
    return yPos + rowH;
  }

  y = drawTableHeader(y);
  while (itemIdx < items.length) {
    y = drawTableRow(y, items[itemIdx]);
    itemIdx++;
    if (y > pageHeight - 45 && itemIdx < items.length) break;
  }

  while (itemIdx < items.length) {
    doc.addPage();
    totalPages++;
    setFont('normal', 9);
    doc.text('\u8ACB\u6C42\u66F8\u756A\u53F7', 140, 15);
    doc.text(invoice.invoiceNumber || '', 170, 15);
    y = drawTableHeader(25);
    while (itemIdx < items.length) {
      y = drawTableRow(y, items[itemIdx]);
      itemIdx++;
      if (y > pageHeight - 50 && itemIdx < items.length) break;
    }
  }

  // 内訳
  y += 5;
  setFont('normal', 8);
  const taxPct = Math.round((invoice.taxRate || 0.1) * 100);
  const taxX = colPrice + 3;
  doc.text('\u5185\u8A33', taxX - 12, y + 4);
  doc.text(taxPct + '%\u5BFE\u8C61(\u7A0E\u629C)', taxX, y + 4);
  doc.text(fmtN(invoice.subtotal) + '\u5186', tableRight - 3, y + 4, { align: 'right' });
  y += 5;
  doc.text(taxPct + '%\u6D88\u8CBB\u7A0E', taxX, y + 4);
  doc.text(fmtN(invoice.tax) + '\u5186', tableRight - 3, y + 4, { align: 'right' });

  // 備考
  y += 15;
  setFont('bold', 9);
  doc.text('\u5099\u8003', marginLeft + 5, y);
  drawLine(marginLeft, y + 2, marginLeft + contentWidth, y + 2);
  y += 8;
  if (invoice.notes) {
    setFont('normal', 9);
    const noteLines = doc.splitTextToSize(invoice.notes, contentWidth - 10);
    doc.text(noteLines, marginLeft + 5, y);
  }

  // ページ番号
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    setFont('normal', 8);
    doc.text(p + ' / ' + totalPages, pageWidth / 2, pageHeight - 10, { align: 'center' });
  }

  // 保存
  const filename = (invoice.customerName || 'customer') + '\u69D8_' +
    (invoice.subject || 'invoice') + '_\u8ACB\u6C42\u66F8_' +
    (invoice.invoiceNumber || 'draft') + '.pdf';
  doc.save(filename);
  showToast('PDF\u3092\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3057\u307E\u3057\u305F', 'success');
}
