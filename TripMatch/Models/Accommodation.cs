using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 住宿資訊表：記錄行程中的飯店安排
/// </summary>
public partial class Accommodation
{
    /// <summary>
    /// 流水號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 隸屬行程 ID (Trips.Id)
    /// </summary>
    public int TripId { get; set; }

    /// <summary>
    /// 飯店景點快照編號 (PlacesSnapshot.SpotId)
    /// </summary>
    public int SpotId { get; set; }

    /// <summary>
    /// 飯店名稱 (冗餘存放，避免 Join 並作為快照備份)
    /// </summary>
    public string HotelName { get; set; } = null!;

    /// <summary>
    /// 飯店地址快照
    /// </summary>
    public string? Address { get; set; }

    /// <summary>
    /// 入住日期時間
    /// </summary>
    public DateTime CheckInDate { get; set; }

    /// <summary>
    /// 退房日期時間
    /// </summary>
    public DateTime CheckOutDate { get; set; }

    /// <summary>
    /// 住宿總費用
    /// </summary>
    public decimal? Price { get; set; }

    /// <summary>
    /// 資料建立時間
    /// </summary>
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>
    /// 樂觀並行控制欄位 (RowVersion)：確保多人同時編輯住宿資訊時不產生數據覆蓋
    /// </summary>
    public byte[] RowVersion { get; set; } = null!;

    public virtual PlacesSnapshot Spot { get; set; } = null!;

    public virtual Trip Trip { get; set; } = null!;
}
