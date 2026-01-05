using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 航班資訊表：儲存行程交通中的飛行排程與費用紀錄
/// </summary>
public partial class Flight
{
    /// <summary>
    /// 航班流水號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 隸屬行程 ID (Trips.Id)
    /// </summary>
    public int TripId { get; set; }

    /// <summary>
    /// 航空公司名稱 (例如：長榮航空、JAL)
    /// </summary>
    public string Carrier { get; set; } = null!;

    /// <summary>
    /// 航班號碼 (例如：BR225、CI100)
    /// </summary>
    public string FlightNumber { get; set; } = null!;

    /// <summary>
    /// 出發機場 IATA 3碼 (例如：TPE)
    /// </summary>
    public string FromAirport { get; set; } = null!;

    /// <summary>
    /// 抵達機場 IATA 3碼 (例如：NRT)
    /// </summary>
    public string ToAirport { get; set; } = null!;

    /// <summary>
    /// 預計起飛時間 (包含當地時區位移偏移量)
    /// </summary>
    public DateTimeOffset DepartUtc { get; set; }

    /// <summary>
    /// 預計抵達時間 (包含當地時區位移偏移量)
    /// </summary>
    public DateTimeOffset ArriveUtc { get; set; }

    /// <summary>
    /// 機票費用 (建議以本位幣記錄，支援匯率轉換後的小數點)
    /// </summary>
    public decimal? Price { get; set; }

    /// <summary>
    /// 系統紀錄建立時間
    /// </summary>
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>
    /// 樂觀並行控制欄位 (RowVersion)：處理多人編輯衝突的核心機制
    /// </summary>
    public byte[] RowVersion { get; set; } = null!;

    public virtual Trip Trip { get; set; } = null!;
}
