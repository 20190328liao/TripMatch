using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 行程區域關聯表：紀錄該行程感興趣或計畫前往的行政區域（城市）
/// </summary>
public partial class TripRegion
{
    /// <summary>
    /// 行程編號 (外鍵，連結至 Trips.Id)
    /// </summary>
    public int TripId { get; set; }

    /// <summary>
    /// 區域編號 (外鍵，連結至 GlobalRegions.Id)
    /// </summary>
    public int RegionId { get; set; }

    /// <summary>
    /// 樂觀並行控制版本號：防止多人同時編輯行程區域時產生資料覆蓋
    /// </summary>
    public byte[] RowVersion { get; set; } = null!;

    public virtual GlobalRegion Region { get; set; } = null!;

    public virtual Trip Trip { get; set; } = null!;
}
