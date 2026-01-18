import { TripApi } from '../api/trip-api.js';

export class HotelModal {
    constructor(modalId, onSaveSuccess) {
        this.modalEl = document.getElementById(modalId);
        this.bsModal = new bootstrap.Modal(this.modalEl);
        this.onSaveSuccess = onSaveSuccess; // callback
        this.initEvents();
    }

    initEvents() {
        this.modalEl.querySelector('#save-hotel-btn').addEventListener('click', () => this.save());
        // ... 綁定 autocomplete 等 ...
    }

    show() {
        // 清空欄位...
        this.bsModal.show();
    }

    async save() {
        // 取得欄位值...
        // 呼叫 API
        try {
            await TripApi.addAccommodation(dto);
            this.bsModal.hide();
            if (this.onSaveSuccess) this.onSaveSuccess();
        } catch (e) {
            alert('儲存失敗');
        }
    }
}