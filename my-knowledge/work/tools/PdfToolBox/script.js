// 初期化時にローディングを確実に非表示にする
document.addEventListener('DOMContentLoaded', initApp);
window.onload = ensureLoadingHidden;

// グローバルエラーハンドリング
window.onerror = function(message, source, lineno, colno, error) {
    console.error('エラーが発生しました:', message);
    hideLoading();
    alert('エラーが発生しました: ' + message);
    return true;
};

// 非同期処理のエラーをキャッチ
window.addEventListener('unhandledrejection', function(event) {
    console.error('未処理のPromise拒否:', event.reason);
    hideLoading();
    alert('処理中にエラーが発生しました。ページを再読み込みしてください。');
});

// 各タブの状態を管理するオブジェクト
const state = {
    merge: { files: [] },
    split: { file: null, numPages: 0 },
    rotate: { file: null, numPages: 0, rotations: {}, selectedPages: [] },
    reorder: { file: null, numPages: 0, pageOrder: [] },
    extract: { file: null, numPages: 0, selectedPages: [] }
};

// アプリケーションの初期化
function initApp() {
    // 初期状態ではローディングを非表示
    hideLoading();
    
    // タブ切り替え
    setupTabs();
    
    // 各機能のセットアップ
    setupMergeTab();
    setupSplitTab();
    setupRotateTab();
    setupReorderTab();
    setupExtractTab();
    
    // 念のため、3秒後にもローディングを非表示にする
    setTimeout(hideLoading, 3000);
}

// ローディングが表示されたままにならないようにする
function ensureLoadingHidden() {
    hideLoading();
}

// タブ切り替え機能のセットアップ
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');
            
            // アクティブなタブを切り替え
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// ローディングオーバーレイの表示/非表示
let loadingTimeout;

function showLoading() {
    clearTimeout(loadingTimeout);
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
        // 少し遅延させてからクラスを削除することで、CSSトランジションを有効にする
        setTimeout(() => {
            loadingOverlay.classList.remove('hidden');
        }, 10);
    }
    
    // 20秒後に自動的にローディングを非表示にする（無限ローディング防止）
    loadingTimeout = setTimeout(() => {
        hideLoading();
        console.warn('ローディングがタイムアウトしました');
        alert('処理に時間がかかりすぎています。ページを再読み込みするか、小さいサイズのPDFで試してください。');
    }, 20000);
}

function hideLoading() {
    clearTimeout(loadingTimeout);
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
        // CSSトランジションが完了した後に完全に非表示にする
        setTimeout(() => {
            loadingOverlay.style.display = 'none';
        }, 300); // CSSのトランジション時間と同じ
    }
}

// 安全なPDF処理関数 - エラーハンドリングとローディング制御を統合
async function safelyProcessPdf(processingFunction) {
    showLoading();
    try {
        await processingFunction();
    } catch (error) {
        console.error('PDF処理エラー:', error);
        
        // エラーメッセージをより詳細に
        let errorMessage = 'PDF処理中にエラーが発生しました: ';
        
        if (error.message) {
            if (error.message.includes('malformed') || error.message.includes('corrupt')) {
                errorMessage += 'PDFファイルが破損しているか、形式が正しくありません。';
            } else if (error.message.includes('password')) {
                errorMessage += 'PDFファイルがパスワードで保護されています。パスワードなしのPDFを使用してください。';
            } else if (error.message.includes('memory')) {
                errorMessage += 'メモリ不足です。より小さいサイズのPDFを使用してください。';
            } else {
                errorMessage += error.message;
            }
        } else {
            errorMessage += '不明なエラー';
        }
        
        alert(errorMessage);
    } finally {
        hideLoading();
    }
}

// PDFファイルを安全に読み込む共通関数
async function loadAndVerifyPdf(file) {
    if (!file) {
        throw new Error('ファイルが選択されていません');
    }
    
    try {
        // ファイルをBlobとして扱い、そこからArrayBufferを作成
        const fileData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // ArrayBufferをUint8Arrayに変換して、コピーを作成
                const arrayBuffer = reader.result;
                const uint8Array = new Uint8Array(arrayBuffer);
                resolve(uint8Array);
            };
            reader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
            reader.readAsArrayBuffer(file);
        });
        
        // PDF.jsでPDFとして読み込めるか検証
        // コピーを作成して元のデータを保護
        const verifyData = new Uint8Array(fileData);
        const pdfDocument = await pdfjsLib.getDocument({data: verifyData}).promise;
        const numPages = pdfDocument.numPages;
        
        if (numPages <= 0) {
            throw new Error('PDFにページがありません');
        }
        
        // 検証が成功したら、PDF-Libで使用するためのUint8Arrayを返す
        return {
            data: fileData,
            numPages: numPages
        };
    } catch (error) {
        console.error('PDFファイル検証エラー:', error);
        if (error.name === 'PasswordException') {
            throw new Error('PDFファイルがパスワードで保護されています。パスワードなしのPDFを使用してください。');
        } else if (error.message && error.message.includes('Invalid PDF')) {
            throw new Error('無効なPDFファイルです。正しいPDFファイルを選択してください。');
        } else if (error.message && error.message.includes('detached ArrayBuffer')) {
            throw new Error('ファイルの読み込みに失敗しました。ブラウザの問題の可能性があります。ページを再読み込みしてください。');
        } else {
            throw new Error(`PDFファイルの読み込みに失敗しました: ${error.message || '不明なエラー'}`);
        }
    }
}

// PDF-Libを使用してPDFを安全に操作する関数
async function safelyModifyPdf(pdfData, modifyFunction) {
    try {
        // PDFドキュメントを読み込む
        // PDFデータのコピーを作成して、元のデータが変更されないようにする
        const pdfDataCopy = new Uint8Array(pdfData);
        
        const pdfDoc = await PDFLib.PDFDocument.load(pdfDataCopy, {
            ignoreEncryption: false,
            updateMetadata: false
        });
        
        // 暗号化されているかチェック
        if (pdfDoc.isEncrypted) {
            throw new Error('PDFファイルがパスワードで保護されています。パスワードなしのPDFを使用してください。');
        }
        
        // 修正関数を実行
        const result = await modifyFunction(pdfDoc);
        
        return result;
    } catch (error) {
        console.error('PDF修正エラー:', error);
        
        // エラーメッセージを整形
        if (error.message.includes('encrypted') || error.message.includes('password')) {
            throw new Error('PDFファイルがパスワードで保護されています。パスワードなしのPDFを使用してください。');
        } else if (error.message.includes('malformed') || error.message.includes('corrupt')) {
            throw new Error('PDFファイルが破損しているか、形式が正しくありません。');
        } else if (error.message.includes('detached ArrayBuffer')) {
            throw new Error('ファイルの処理中にエラーが発生しました。ブラウザの問題の可能性があります。ページを再読み込みしてください。');
        } else {
            throw error;
        }
    }
}

// PDFの結合機能のセットアップ
function setupMergeTab() {
    const fileInput = document.getElementById('merge-file-input');
    const fileList = document.getElementById('merge-file-list');
    const mergeBtn = document.getElementById('merge-btn');

    if (!fileInput || !fileList || !mergeBtn) {
        console.error('結合タブの要素が見つかりません');
        return;
    }

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;
        
        await safelyProcessPdf(async () => {
            for (const file of files) {
                // 既に追加済みのファイルは無視
                if (state.merge.files.some(f => f.name === file.name)) continue;
                
                // PDFファイルの検証
                const { data, numPages } = await loadAndVerifyPdf(file);
                
                // ファイルリストに追加
                state.merge.files.push({
                    file: file,
                    name: file.name,
                    pages: numPages,
                    data: data
                });
                
                // UIに表示
                const fileItem = document.createElement('div');
                fileItem.className = 'file-item';
                fileItem.innerHTML = `
                    <span>${file.name} (${numPages}ページ)</span>
                    <button class="remove-btn" data-name="${file.name}">×</button>
                `;
                fileList.appendChild(fileItem);
            }
            
            // 結合ボタンの有効化
            mergeBtn.disabled = state.merge.files.length < 2;
        });
    });

    // ファイル削除ボタンの処理
    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-btn')) {
            const fileName = e.target.getAttribute('data-name');
            state.merge.files = state.merge.files.filter(f => f.name !== fileName);
            e.target.parentElement.remove();
            
            // 結合ボタンの有効化/無効化
            mergeBtn.disabled = state.merge.files.length < 2;
        }
    });

    // PDFの結合処理
    mergeBtn.addEventListener('click', () => {
        if (state.merge.files.length < 2) return;
        
        safelyProcessPdf(async () => {
            try {
                // 結合するファイルのデータを準備
                const pdfDocuments = [];
                const failedFiles = [];
                
                // すべてのファイルを読み込む
                for (const fileData of state.merge.files) {
                    try {
                        console.log(`ファイル ${fileData.name} の読み込みを開始...`);
                        
                        // ファイルを再度読み込み直す（ArrayBufferの問題を回避）
                        const fileReader = new FileReader();
                        const fileDataPromise = new Promise((resolve, reject) => {
                            fileReader.onload = () => {
                                const arrayBuffer = fileReader.result;
                                const uint8Array = new Uint8Array(arrayBuffer);
                                resolve(uint8Array);
                            };
                            fileReader.onerror = () => reject(new Error('ファイルの読み込みに失敗しました'));
                            fileReader.readAsArrayBuffer(fileData.file);
                        });
                        
                        const freshData = await fileDataPromise;
                        
                        // PDFドキュメントを読み込む
                        const pdfDoc = await PDFLib.PDFDocument.load(freshData);
                        pdfDocuments.push({
                            name: fileData.name,
                            doc: pdfDoc
                        });
                        
                        console.log(`ファイル ${fileData.name} の読み込みが完了しました`);
                    } catch (error) {
                        console.error(`ファイル ${fileData.name} の読み込みに失敗しました:`, error);
                        failedFiles.push(fileData.name);
                    }
                }
                
                // 読み込みに成功したファイルがあるか確認
                if (pdfDocuments.length === 0) {
                    throw new Error('すべてのPDFファイルの読み込みに失敗しました。');
                }
                
                // 失敗したファイルがあれば警告を表示
                if (failedFiles.length > 0) {
                    alert(`警告: 以下のファイルの読み込みに失敗しましたが、他のファイルの処理を続行します。\n${failedFiles.join('\n')}`);
                }
                
                // 新しいPDFドキュメントを作成
                const mergedPdf = await PDFLib.PDFDocument.create();
                
                // 各PDFドキュメントからページをコピー
                for (const { name, doc } of pdfDocuments) {
                    try {
                        // ページ数を取得
                        const pageCount = doc.getPageCount();
                        console.log(`ファイル ${name} のページ数: ${pageCount}`);
                        
                        if (pageCount > 0) {
                            // ページインデックスの配列を作成
                            const pageIndices = Array.from({ length: pageCount }, (_, i) => i);
                            
                            // ページをコピー
                            const copiedPages = await mergedPdf.copyPages(doc, pageIndices);
                            
                            // コピーしたページを追加
                            copiedPages.forEach(page => mergedPdf.addPage(page));
                            
                            console.log(`ファイル ${name} のページを追加しました`);
                        }
                    } catch (error) {
                        console.error(`ファイル ${name} のページコピー中にエラーが発生しました:`, error);
                        alert(`警告: ファイル "${name}" のページコピー中にエラーが発生しましたが、処理を続行します。`);
                    }
                }
                
                // ページが追加されたか確認
                const finalPageCount = mergedPdf.getPageCount();
                if (finalPageCount === 0) {
                    throw new Error('結合するページがありません。すべてのPDFファイルの処理に失敗しました。');
                }
                
                console.log(`結合後の総ページ数: ${finalPageCount}`);
                
                // PDFを保存
                const mergedPdfBytes = await mergedPdf.save();
                
                // 結合したPDFをダウンロード
                const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
                saveAs(blob, '結合したPDF.pdf');
                
                alert(`PDFの結合が完了しました。${pdfDocuments.length}個のファイルから${finalPageCount}ページを結合しました。`);
            } catch (error) {
                console.error('PDFの結合エラー:', error);
                throw error;
            }
        });
    });
}

// PDFの分割機能のセットアップ
function setupSplitTab() {
    const fileInput = document.getElementById('split-file-input');
    const splitBtn = document.getElementById('split-btn');
    const splitType = document.getElementById('split-type');
    const rangeInput = document.getElementById('range-input');
    const pageRanges = document.getElementById('page-ranges');
    const previewContainer = document.getElementById('split-preview');

    if (!fileInput || !splitBtn || !splitType || !rangeInput || !pageRanges || !previewContainer) {
        console.error('分割タブの要素が見つかりません');
        return;
    }

    // 分割タイプの変更イベント
    splitType.addEventListener('change', () => {
        if (splitType.value === 'range') {
            rangeInput.classList.remove('hidden');
        } else {
            rangeInput.classList.add('hidden');
        }
    });

    // ファイル選択イベント
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        safelyProcessPdf(async () => {
            // PDFファイルの読み込み
            const { data, numPages } = await loadAndVerifyPdf(file);
            
            state.split.file = file;
            state.split.numPages = numPages;
            state.split.data = data;
            
            // プレビューの表示
            previewContainer.innerHTML = '';
            
            try {
                // PDFドキュメントを一度だけ読み込む
                // データのコピーを作成して元のデータを保護
                const previewData = new Uint8Array(data);
                const pdfDocument = await pdfjsLib.getDocument({data: previewData}).promise;
                
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'page-thumbnail';
                    thumbnail.appendChild(canvas);
                    
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = `ページ ${i}`;
                    thumbnail.appendChild(pageNumber);
                    
                    previewContainer.appendChild(thumbnail);
                }
            } catch (error) {
                console.error('プレビュー生成エラー:', error);
                alert('プレビューの生成に失敗しましたが、分割機能は使用できます。');
            }
            
            // 分割ボタンの有効化
            splitBtn.disabled = false;
        });
    });

    // PDFの分割処理
    splitBtn.addEventListener('click', () => {
        if (!state.split.file) return;
        
        safelyProcessPdf(async () => {
            try {
                // PDFデータのコピーを作成して、元のデータが変更されないようにする
                const pdfDataCopy = new Uint8Array(state.split.data);
                
                // 安全にPDFを操作
                await safelyModifyPdf(pdfDataCopy, async (pdfDoc) => {
                    if (splitType.value === 'all') {
                        // 全ページを個別ファイルに分割
                        for (let i = 0; i < state.split.numPages; i++) {
                            const newPdf = await PDFLib.PDFDocument.create();
                            const [page] = await newPdf.copyPages(pdfDoc, [i]);
                            newPdf.addPage(page);
                            
                            const pdfBytes = await newPdf.save();
                            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                            saveAs(blob, `分割_ページ${i + 1}.pdf`);
                        }
                    } else {
                        // ページ範囲で分割
                        const ranges = parsePageRanges(pageRanges.value, state.split.numPages);
                        
                        for (let i = 0; i < ranges.length; i++) {
                            const range = ranges[i];
                            const newPdf = await PDFLib.PDFDocument.create();
                            const pages = await newPdf.copyPages(pdfDoc, range);
                            pages.forEach(page => newPdf.addPage(page));
                            
                            const pdfBytes = await newPdf.save();
                            const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                            saveAs(blob, `分割_範囲${i + 1}.pdf`);
                        }
                    }
                    
                    // 成功を示す値を返す
                    return true;
                });
                
                alert('PDFの分割が完了しました。');
            } catch (error) {
                console.error('PDFの分割エラー:', error);
                throw error;
            }
        });
    });
}

// ページ範囲の解析（例: "1-3,5,7-9"）
function parsePageRanges(rangeStr, maxPages) {
    if (!rangeStr.trim()) {
        return [[0, maxPages - 1]]; // 全ページ
    }
    
    const ranges = [];
    const parts = rangeStr.split(',');
    
    for (const part of parts) {
        if (part.includes('-')) {
            const [start, end] = part.split('-').map(num => parseInt(num.trim()) - 1);
            
            if (isNaN(start) || isNaN(end) || start < 0 || end >= maxPages || start > end) {
                continue;
            }
            
            const pageIndices = [];
            for (let i = start; i <= end; i++) {
                pageIndices.push(i);
            }
            ranges.push(pageIndices);
        } else {
            const pageIndex = parseInt(part.trim()) - 1;
            
            if (isNaN(pageIndex) || pageIndex < 0 || pageIndex >= maxPages) {
                continue;
            }
            
            ranges.push([pageIndex]);
        }
    }
    
    return ranges;
}

// PDFの回転機能のセットアップ
function setupRotateTab() {
    const fileInput = document.getElementById('rotate-file-input');
    const previewContainer = document.getElementById('rotate-preview');
    const rotateControls = document.getElementById('rotate-controls');
    const rotateButtons = document.querySelectorAll('.rotate-btn');
    const rotateScope = document.getElementById('rotate-scope');
    const saveBtn = document.getElementById('rotate-save-btn');

    if (!fileInput || !previewContainer || !rotateControls || !rotateScope || !saveBtn) {
        console.error('回転タブの要素が見つかりません');
        return;
    }

    // ファイル選択イベント
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        safelyProcessPdf(async () => {
            // PDFファイルの読み込み
            const { data, numPages } = await loadAndVerifyPdf(file);
            
            state.rotate.file = file;
            state.rotate.numPages = numPages;
            state.rotate.data = data;
            state.rotate.rotations = {};
            state.rotate.selectedPages = [];
            
            // プレビューの表示
            previewContainer.innerHTML = '';
            
            try {
                // PDFドキュメントを一度だけ読み込む
                // データのコピーを作成して元のデータを保護
                const previewData = new Uint8Array(data);
                const pdfDocument = await pdfjsLib.getDocument({data: previewData}).promise;
                
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'page-thumbnail';
                    thumbnail.setAttribute('data-page', i);
                    thumbnail.appendChild(canvas);
                    
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = `ページ ${i}`;
                    thumbnail.appendChild(pageNumber);
                    
                    // サムネイルのクリックイベント
                    thumbnail.addEventListener('click', () => {
                        const pageIndex = parseInt(thumbnail.getAttribute('data-page'));
                        
                        if (thumbnail.classList.contains('selected')) {
                            thumbnail.classList.remove('selected');
                            state.rotate.selectedPages = state.rotate.selectedPages.filter(p => p !== pageIndex);
                        } else {
                            thumbnail.classList.add('selected');
                            state.rotate.selectedPages.push(pageIndex);
                        }
                    });
                    
                    previewContainer.appendChild(thumbnail);
                }
            } catch (error) {
                console.error('プレビュー生成エラー:', error);
                alert('プレビューの生成に失敗しましたが、回転機能は使用できます。');
            }
            
            // 回転コントロールの表示
            rotateControls.classList.remove('hidden');
            
            // 保存ボタンの有効化
            saveBtn.disabled = false;
        });
    });

    // 回転ボタンのイベント
    rotateButtons.forEach(button => {
        button.addEventListener('click', () => {
            const degrees = parseInt(button.getAttribute('data-degrees'));
            const scope = rotateScope.value;
            
            safelyProcessPdf(async () => {
                if (scope === 'all') {
                    // すべてのページに適用
                    for (let i = 1; i <= state.rotate.numPages; i++) {
                        state.rotate.rotations[i] = (state.rotate.rotations[i] || 0) + degrees;
                    }
                } else {
                    // 選択したページのみに適用
                    for (const pageIndex of state.rotate.selectedPages) {
                        state.rotate.rotations[pageIndex] = (state.rotate.rotations[pageIndex] || 0) + degrees;
                    }
                }
                
                // プレビューの更新
                await updateRotatePreview();
            });
        });
    });

    // 回転プレビューの更新
    async function updateRotatePreview() {
        if (!state.rotate.file) return;
        
        try {
            // PDFデータのコピーを作成して、元のデータが変更されないようにする
            const pdfDataCopy = new Uint8Array(state.rotate.data);
            
            const pdfDocument = await pdfjsLib.getDocument({data: pdfDataCopy}).promise;
            
            for (let i = 1; i <= state.rotate.numPages; i++) {
                const rotation = state.rotate.rotations[i] || 0;
                
                if (rotation !== 0) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5, rotation: rotation });
                    
                    const thumbnail = document.querySelector(`.page-thumbnail[data-page="${i}"]`);
                    if (!thumbnail) continue;
                    
                    const canvas = thumbnail.querySelector('canvas');
                    if (!canvas) continue;
                    
                    const context = canvas.getContext('2d');
                    if (!context) continue;
                    
                    // キャンバスをクリア
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    
                    // キャンバスのサイズを調整
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                }
            }
        } catch (error) {
            console.error('回転プレビュー更新エラー:', error);
            alert('プレビューの更新に失敗しました: ' + (error.message || '不明なエラー'));
        }
    }

    // PDFの回転保存処理
    saveBtn.addEventListener('click', () => {
        if (!state.rotate.file) return;
        
        safelyProcessPdf(async () => {
            try {
                // PDFデータのコピーを作成して、元のデータが変更されないようにする
                const pdfDataCopy = new Uint8Array(state.rotate.data);
                
                // 安全にPDFを操作
                const pdfBytes = await safelyModifyPdf(pdfDataCopy, async (pdfDoc) => {
                    // 回転の適用
                    for (let i = 1; i <= state.rotate.numPages; i++) {
                        const rotation = state.rotate.rotations[i] || 0;
                        
                        if (rotation !== 0) {
                            const page = pdfDoc.getPage(i - 1);
                            const currentRotation = page.getRotation().angle;
                            page.setRotation(PDFLib.degrees(currentRotation + rotation));
                        }
                    }
                    
                    // 保存
                    return await pdfDoc.save();
                });
                
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                saveAs(blob, '回転したPDF.pdf');
            } catch (error) {
                console.error('PDFの回転保存エラー:', error);
                throw error;
            }
        });
    });
}

// ページの並べ替え機能のセットアップ
function setupReorderTab() {
    const fileInput = document.getElementById('reorder-file-input');
    const previewContainer = document.getElementById('reorder-preview');
    const saveBtn = document.getElementById('reorder-save-btn');

    if (!fileInput || !previewContainer || !saveBtn) {
        console.error('並べ替えタブの要素が見つかりません');
        return;
    }

    // ファイル選択イベント
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        safelyProcessPdf(async () => {
            // PDFファイルの読み込み
            const { data, numPages } = await loadAndVerifyPdf(file);
            
            state.reorder.file = file;
            state.reorder.numPages = numPages;
            state.reorder.data = data;
            state.reorder.pageOrder = Array.from({ length: numPages }, (_, i) => i + 1);
            
            // プレビューの表示
            previewContainer.innerHTML = '';
            
            try {
                // PDFドキュメントを一度だけ読み込む
                // データのコピーを作成して元のデータを保護
                const previewData = new Uint8Array(data);
                const pdfDocument = await pdfjsLib.getDocument({data: previewData}).promise;
                
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'page-thumbnail';
                    thumbnail.setAttribute('data-page', i);
                    thumbnail.appendChild(canvas);
                    
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = `ページ ${i}`;
                    thumbnail.appendChild(pageNumber);
                    
                    previewContainer.appendChild(thumbnail);
                }
            } catch (error) {
                console.error('プレビュー生成エラー:', error);
                alert('プレビューの生成に失敗しましたが、並べ替え機能は使用できます。');
            }
            
            // Sortableの初期化
            if (typeof Sortable !== 'undefined') {
                new Sortable(previewContainer, {
                    animation: 150,
                    onEnd: function() {
                        // 並べ替え後のページ順序を更新
                        const thumbnails = previewContainer.querySelectorAll('.page-thumbnail');
                        state.reorder.pageOrder = Array.from(thumbnails).map(
                            thumbnail => parseInt(thumbnail.getAttribute('data-page'))
                        );
                    }
                });
            } else {
                console.error('Sortableライブラリが読み込まれていません');
                alert('ドラッグ＆ドロップ機能が利用できません。ページを再読み込みしてください。');
            }
            
            // 保存ボタンの有効化
            saveBtn.disabled = false;
        });
    });

    // PDFの並べ替え保存処理
    saveBtn.addEventListener('click', () => {
        if (!state.reorder.file) return;
        
        safelyProcessPdf(async () => {
            try {
                // PDFデータのコピーを作成して、元のデータが変更されないようにする
                const pdfDataCopy = new Uint8Array(state.reorder.data);
                
                // 安全にPDFを操作
                const pdfBytes = await safelyModifyPdf(pdfDataCopy, async (pdfDoc) => {
                    const newPdf = await PDFLib.PDFDocument.create();
                    
                    // 並べ替えたページの順序でコピー
                    for (const pageIndex of state.reorder.pageOrder) {
                        const [page] = await newPdf.copyPages(pdfDoc, [pageIndex - 1]);
                        newPdf.addPage(page);
                    }
                    
                    // 保存
                    return await newPdf.save();
                });
                
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                saveAs(blob, '並べ替えたPDF.pdf');
            } catch (error) {
                console.error('PDFの並べ替え保存エラー:', error);
                throw error;
            }
        });
    });
}

// ページの抽出機能のセットアップ
function setupExtractTab() {
    const fileInput = document.getElementById('extract-file-input');
    const previewContainer = document.getElementById('extract-preview');
    const saveBtn = document.getElementById('extract-save-btn');

    if (!fileInput || !previewContainer || !saveBtn) {
        console.error('抽出タブの要素が見つかりません');
        return;
    }

    // ファイル選択イベント
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        
        const file = e.target.files[0];
        
        safelyProcessPdf(async () => {
            // PDFファイルの読み込み
            const { data, numPages } = await loadAndVerifyPdf(file);
            
            state.extract.file = file;
            state.extract.numPages = numPages;
            state.extract.data = data;
            state.extract.selectedPages = [];
            
            // プレビューの表示
            previewContainer.innerHTML = '';
            
            try {
                // PDFドキュメントを一度だけ読み込む
                // データのコピーを作成して元のデータを保護
                const previewData = new Uint8Array(data);
                const pdfDocument = await pdfjsLib.getDocument({data: previewData}).promise;
                
                for (let i = 1; i <= numPages; i++) {
                    const page = await pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 0.5 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    
                    const thumbnail = document.createElement('div');
                    thumbnail.className = 'page-thumbnail';
                    thumbnail.setAttribute('data-page', i);
                    thumbnail.appendChild(canvas);
                    
                    const pageNumber = document.createElement('div');
                    pageNumber.className = 'page-number';
                    pageNumber.textContent = `ページ ${i}`;
                    thumbnail.appendChild(pageNumber);
                    
                    // サムネイルのクリックイベント
                    thumbnail.addEventListener('click', () => {
                        const pageIndex = parseInt(thumbnail.getAttribute('data-page'));
                        
                        if (thumbnail.classList.contains('selected')) {
                            thumbnail.classList.remove('selected');
                            state.extract.selectedPages = state.extract.selectedPages.filter(p => p !== pageIndex);
                        } else {
                            thumbnail.classList.add('selected');
                            state.extract.selectedPages.push(pageIndex);
                        }
                        
                        // 保存ボタンの有効化/無効化
                        saveBtn.disabled = state.extract.selectedPages.length === 0;
                    });
                    
                    previewContainer.appendChild(thumbnail);
                }
            } catch (error) {
                console.error('プレビュー生成エラー:', error);
                alert('プレビューの生成に失敗しましたが、抽出機能は使用できます。');
            }
            
            // 保存ボタンの無効化
            saveBtn.disabled = true;
        });
    });

    // PDFのページ抽出保存処理
    saveBtn.addEventListener('click', () => {
        if (!state.extract.file || state.extract.selectedPages.length === 0) return;
        
        safelyProcessPdf(async () => {
            try {
                // PDFデータのコピーを作成して、元のデータが変更されないようにする
                const pdfDataCopy = new Uint8Array(state.extract.data);
                
                // 安全にPDFを操作
                const pdfBytes = await safelyModifyPdf(pdfDataCopy, async (pdfDoc) => {
                    const newPdf = await PDFLib.PDFDocument.create();
                    
                    // 選択したページをコピー
                    const pageIndices = state.extract.selectedPages.map(p => p - 1).sort((a, b) => a - b);
                    const pages = await newPdf.copyPages(pdfDoc, pageIndices);
                    pages.forEach(page => newPdf.addPage(page));
                    
                    // 保存
                    return await newPdf.save();
                });
                
                const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                saveAs(blob, '抽出したページ.pdf');
            } catch (error) {
                console.error('PDFのページ抽出エラー:', error);
                throw error;
            }
        });
    });
} 