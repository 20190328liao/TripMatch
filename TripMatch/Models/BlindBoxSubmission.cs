using System;
using System.Collections.Generic;

namespace TripMatch.Models;

/// <summary>
/// 盲盒候選清單：儲存參與者投遞的景點方案
/// </summary>
public partial class BlindBoxSubmission
{
    /// <summary>
    /// 關聯的行程細項編號 (ItineraryItems.Id，且 Type 須為 2)
    /// </summary>
    public int ItineraryItemId { get; set; }

    /// <summary>
    /// 提議者的使用者 ID
    /// </summary>
    public int UserId { get; set; }

    /// <summary>
    /// 提議的景點快照編號 (Places_Snapshot.SpotId)
    /// </summary>
    public int SpotId { get; set; }

    /// <summary>
    /// 提議者的推薦理由或備註
    /// </summary>
    public string? SuggestionNote { get; set; }

    /// <summary>
    /// 中獎標籤：1=此提議被系統選中為最終景點
    /// </summary>
    public bool IsWinner { get; set; }

    /// <summary>
    /// 投遞時間 (可用於決定平手時的順序或種子值)
    /// </summary>
    public DateTimeOffset? SubmittedAt { get; set; }

    public virtual ItineraryItem ItineraryItem { get; set; } = null!;

    public virtual PlacesSnapshot Spot { get; set; } = null!;
}
