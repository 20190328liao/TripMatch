```

BenchmarkDotNet v0.15.2, Windows 11 (10.0.26200.7462)
12th Gen Intel Core i7-12700H 2.30GHz, 1 CPU, 20 logical and 14 physical cores
.NET SDK 9.0.308
  [Host]     : .NET 8.0.22 (8.0.2225.52707), X64 RyuJIT AVX2
  DefaultJob : .NET 8.0.22 (8.0.2225.52707), X64 RyuJIT AVX2


```
| Method        | Mean      | Error    | StdDev    | Median    | Ratio | RatioSD | Gen0   | Allocated | Alloc Ratio |
|-------------- |----------:|---------:|----------:|----------:|------:|--------:|-------:|----------:|------------:|
| Original_Jpg  | 262.56 ns | 4.166 ns |  3.693 ns | 261.46 ns |  1.00 |    0.02 | 0.1154 |    1448 B |        1.00 |
| Optimized_Jpg |  38.59 ns | 0.517 ns |  0.459 ns |  38.55 ns |  0.15 |    0.00 | 0.0102 |     128 B |        0.09 |
| Original_Png  | 311.86 ns | 6.174 ns | 11.289 ns | 306.10 ns |  1.19 |    0.05 | 0.1154 |    1448 B |        1.00 |
| Optimized_Png |  39.54 ns | 0.744 ns |  0.621 ns |  39.70 ns |  0.15 |    0.00 | 0.0102 |     128 B |        0.09 |
| Original_Gif  | 286.59 ns | 5.727 ns | 12.690 ns | 284.28 ns |  1.09 |    0.05 | 0.1154 |    1448 B |        1.00 |
| Optimized_Gif |  39.32 ns | 0.444 ns |  0.623 ns |  39.35 ns |  0.15 |    0.00 | 0.0102 |     128 B |        0.09 |
