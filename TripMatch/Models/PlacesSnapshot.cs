using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace TripMatch.Models;

/// <summary>
/// 景點與地點快照庫：快取來自 Google Places 的資訊以節省 API 成本
/// </summary>
public partial class PlacesSnapshot
{
    /// <summary>
    /// 內部唯一編號 (主鍵)
    /// </summary>
    public int SpotId { get; set; }

    /// <summary>
    /// Google Places 原始 PlaceID (用於防重與同步)
    /// </summary>
    public string ExternalPlaceId { get; set; } = null!;

    /// <summary>
    /// 地點分類 ID (關聯 LocationCategories 表)
    /// </summary>
    public int? LocationCategoryId { get; set; }

    /// <summary>
    /// 景點中文名稱
    /// </summary>
    [Column("Name_Zh")]
    public string NameZh { get; set; } = null!;

    /// <summary>
    /// 景點英文名稱
    /// </summary>
    [Column("Name_En")]
    public string? NameEn { get; set; }

    /// <summary>
    /// 地點完整地址快照
    /// </summary>
    public string? AddressSnapshot { get; set; }

    /// <summary>
    /// 緯度
    /// </summary>
    public decimal Lat { get; set; }

    /// <summary>
    /// 經度
    /// </summary>
    public decimal Lng { get; set; }

    /// <summary>
    /// Google 評分 (1.0 - 5.0)
    /// </summary>
    public decimal? Rating { get; set; }

    /// <summary>
    /// 總評價人數
    /// </summary>
    public int? UserRatingsTotal { get; set; }

    /// <summary>
    /// 圖片快照：存儲 photo_reference 的 JSON 陣列
    /// </summary>
    public string? PhotosSnapshot { get; set; }

    /// <summary>
    /// 建立時間
    /// </summary>
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>
    /// 最後更新時間
    /// </summary>
    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<Accommodation> Accommodations { get; set; } = new List<Accommodation>();

    public virtual ICollection<BlindBoxSubmission> BlindBoxSubmissions { get; set; } = new List<BlindBoxSubmission>();

    public virtual ICollection<ItineraryItem> ItineraryItems { get; set; } = new List<ItineraryItem>();

    public virtual LocationCategory? LocationCategory { get; set; }

    public virtual ICollection<Wishlist> Wishlists { get; set; } = new List<Wishlist>();
}
