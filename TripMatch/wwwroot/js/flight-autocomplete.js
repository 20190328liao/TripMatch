/**
 * 初始化機場自動補全功能
 * @param {string} inputId - 輸入框的 ID (例如: 'OriginInput')
 * @param {string} listId - 顯示結果列表的 ul ID (例如: 'OriginResults')
 */
function initFlightAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    const resultsList = document.getElementById(listId);
    let timeout = null;

    if (!input || !resultsList) {
        console.warn(`Autocomplete elements not found: ${inputId}, ${listId}`);
        return;
    }

    // 監聽輸入事件
    input.addEventListener('input', () => {
        clearTimeout(timeout);
        const query = input.value.trim();

        if (query.length < 2) {
            resultsList.innerHTML = '';
            resultsList.style.display = 'none'; // 隱藏列表
            return;
        }

        // 防抖處理 (Debounce)
        timeout = setTimeout(() => {
            // 傳遞 input 本身進去，方便後續操作
            fetchPlaces(query, resultsList, input);
        }, 300);
    });

    // 點擊空白處關閉選單
    document.addEventListener('click', (e) => {
        if (e.target !== input && !resultsList.contains(e.target)) {
            resultsList.innerHTML = '';
            resultsList.style.display = 'none';
        }
    });
}

async function fetchPlaces(term, resultsList, inputField) {
      const url = `https://autocomplete.travelpayouts.com/places2?term=${encodeURIComponent(term)}&locale=zh&types[]=airport`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        renderResults(data, resultsList, inputField);
    } catch (error) {
        console.error('API 呼叫失敗:', error);
    }
}

function renderResults(data, resultsList, inputField) {
    if (data.length === 0) {
        // 這裡可以改為中文提示
        resultsList.innerHTML = '<li class="list-group-item">查無結果</li>';
        resultsList.style.display = 'block';
        return;
    }

    // 生成 HTML
    resultsList.innerHTML = data.map(item => {
        const typeLabel = item.type === 'city' ? '城市' : '機場';
        // 因為 locale=zh，這裡的 country_name 也會自動變成中文 (例如 "台灣")
        const subName = item.country_name || '';

        return `
            <li class="list-group-item list-group-item-action cursor-pointer">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <span class="fw-bold text-primary me-2">${item.code}</span>
                        <span class="fw-medium">${item.name}</span>
                        <small class="text-muted d-block">${subName}</small>
                    </div>
                    <span class="badge bg-light text-dark border">${typeLabel}</span>
                </div>
            </li>
        `;
    }).join('');

   // 綁定點擊事件
    const items = resultsList.querySelectorAll('li');
    items.forEach((li, index) => {
        const item = data[index];
        li.onclick = () => {
            // 1. 填入代碼 (這行保持不變，為了讓後端拿到正確的 Code)
            inputField.value = item.code;

            // ★ 新增：將詳細資訊暫存在 input 的 data 屬性中
            // 這樣 Preferences 頁面才有辦法讀取到 "台北" 或 "台灣"
            inputField.dataset.name = item.name;       // 例如：台北
            inputField.dataset.country = item.country_name || ''; // 例如：台灣

            // 清空並隱藏選單
            resultsList.innerHTML = '';
            resultsList.style.display = 'none';
        };
    });

    resultsList.style.display = 'block';
}