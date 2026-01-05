using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class ExpenseParticipant
{
    public int Id { get; set; }

    public int ExpenseId { get; set; }

    public int TripId { get; set; }

    public int UserId { get; set; }

    public decimal ShareAmount { get; set; }

    public virtual Expense Expense { get; set; } = null!;

    public virtual TripMember User { get; set; } = null!;
}
