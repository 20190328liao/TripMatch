using System;
using System.Collections.Generic;

namespace TripMatch.Models;

public partial class Expense
{
    public int ExpenseId { get; set; }

    public int TripId { get; set; }

    public int? CategoryId { get; set; }

    public string Title { get; set; } = null!;

    public decimal Amount { get; set; }

    public int PaidBy { get; set; }

    public DateTimeOffset? CreatedAt { get; set; }

    public virtual Category? Category { get; set; }

    public virtual ICollection<ExpenseParticipant> ExpenseParticipants { get; set; } = new List<ExpenseParticipant>();

    public virtual TripMember PaidByNavigation { get; set; } = null!;

    public virtual Trip Trip { get; set; } = null!;
}
