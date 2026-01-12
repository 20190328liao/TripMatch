window.DateHelper = (function () {

    function fromIso(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    function toIso(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function addDays(date, n) {
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
    }

    function isBefore(a, b) {
        return a < b;
    }

    function isAfter(a, b) {
        return a > b;
    }

    function isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear()
            && a.getMonth() === b.getMonth()
            && a.getDate() === b.getDate();
    }

    function isBetweenInclusive(d, start, end) {
        return d >= start && d <= end;
    }

    function getWeekday(date) {
        return date.getDay(); // 0~6
    }

    function startOfToday() {
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    return {
        fromIso,
        toIso,
        addDays,
        isBefore,
        isAfter,
        isSameDay,
        isBetweenInclusive,
        getWeekday,
        startOfToday
    };
})();
