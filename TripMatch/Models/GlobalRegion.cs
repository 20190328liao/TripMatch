using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 全球區域主檔：存放國家與城市的層級資料，支援中英文雙語
/// </summary>
public partial class GlobalRegion
{
    /// <summary>
    /// 區域自動編號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 中文地名顯示名稱
    /// </summary>
    public string Name { get; set; } = null!;

    /// <summary>
    /// 英文地名顯示名稱 (對接 Google API 使用)
    /// </summary>
    public string NameEn { get; set; } = null!;

    /// <summary>
    /// 層級：1國家, 2城市
    /// </summary>
    public int Level { get; set; }

    /// <summary>
    /// 父層 ID (城市的 ParentId 會指向國家)
    /// </summary>
    public int? ParentId { get; set; }

    /// <summary>
    /// Google Place API 的唯一識別碼
    /// </summary>
    public string PlaceId { get; set; } = null!;

    /// <summary>
    /// ISO 3166-1 alpha-2 國家代碼 (如 JP, TW)
    /// </summary>
    public string? CountryCode { get; set; }

    /// <summary>
    /// 熱門推薦標記：1為熱門地點
    /// </summary>
    public bool IsHot { get; set; }

    /// <summary>
    /// 緯度 (Latitude)：由 Google Maps API 取得，範圍 -90 到 90
    /// </summary>
    public decimal? Lat { get; set; }

    /// <summary>
    /// 經度 (Longitude)：由 Google Maps API 取得，範圍 -180 到 180
    /// </summary>
    public decimal? Lng { get; set; }

    public virtual ICollection<GlobalRegion> InverseParent { get; set; } = new List<GlobalRegion>();

    public virtual GlobalRegion? Parent { get; set; }

    public virtual ICollection<TripRegion> TripRegions { get; set; } = new List<TripRegion>();
}
