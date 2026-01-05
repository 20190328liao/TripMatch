using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 地點分類字典表：定義景點、美食、飯店等類別
/// </summary>
public partial class LocationCategory
{
    /// <summary>
    /// 分類自動編號主鍵
    /// </summary>
    public int Id { get; set; }

    /// <summary>
    /// 分類中文名稱 (如：餐廳)
    /// </summary>
    public string NameZh { get; set; } = null!;

    /// <summary>
    /// 分類英文名稱 (如：Restaurant)
    /// </summary>
    public string NameEn { get; set; } = null!;

    /// <summary>
    /// 前端圖示代碼 (如 FontAwesome 標籤碼)
    /// </summary>
    public string? IconTag { get; set; }

    /// <summary>
    /// 地圖標記或 UI 顯示用的色碼 (十六進位)
    /// </summary>
    public string? ColorCode { get; set; }

    /// <summary>
    /// 顯示排序權重 (越小越靠前)
    /// </summary>
    public int SortOrder { get; set; }

    /// <summary>
    /// 是否啟用 (0=停用, 1=啟用)
    /// </summary>
    public bool IsActive { get; set; }

    /// <summary>
    /// 建立時間
    /// </summary>
    public DateTimeOffset? CreatedAt { get; set; }

    /// <summary>
    /// 最後更新時間
    /// </summary>
    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual ICollection<PlacesSnapshot> PlacesSnapshots { get; set; } = new List<PlacesSnapshot>();
}
