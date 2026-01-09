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

    public int Day { get; set; }

    public virtual Category? Category { get; set; }

    public virtual ICollection<ExpenseParticipant> ExpenseParticipants { get; set; } = new List<ExpenseParticipant>();

    public virtual ICollection<ExpensePayer> ExpensePayers { get; set; } = new List<ExpensePayer>();

    public virtual Trip Trip { get; set; } = null!;
}
