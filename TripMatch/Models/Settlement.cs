using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class Settlement
{
    public int SettlementId { get; set; }

    public int TripId { get; set; }

    /// <summary>
    /// 債務人 (付錢的人)
    /// </summary>
    public int FromUserId { get; set; }

    /// <summary>
    /// 債權人 (領錢的人)
    /// </summary>
    public int ToUserId { get; set; }

    public decimal Amount { get; set; }

    /// <summary>
    /// 結算狀態(0:未支付, 1:已支付)
    /// </summary>
    public bool? IsPaid { get; set; }

    public DateTimeOffset? UpdatedAt { get; set; }

    public virtual TripMember FromUser { get; set; } = null!;

    public virtual TripMember ToUser { get; set; } = null!;

    public virtual Trip Trip { get; set; } = null!;
}
