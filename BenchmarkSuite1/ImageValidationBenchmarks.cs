using System;
using System.IO;
using System.Linq;
using System.Collections.Generic;
using BenchmarkDotNet.Attributes;

namespace TripMatch.Benchmarks
{
    [MemoryDiagnoser]
    public class ImageValidationBenchmarks
    {
        private byte[] jpgHeader;
        private byte[] pngHeader;
        private byte[] gifHeader;
        private string jpgName = "test.jpg";
        private string pngName = "test.png";
        private string gifName = "test.gif";
        [GlobalSetup]
        public void Setup()
        {
            jpgHeader = new byte[]
            {
                0xFF,
                0xD8,
                0xFF,
                0x00,
                0x11,
                0x22
            };
            pngHeader = new byte[]
            {
                0x89,
                0x50,
                0x4E,
                0x47,
                0x0D,
                0x0A,
                0x1A,
                0x0A,
                0x00
            };
            gifHeader = new byte[]
            {
                (byte)'G',
                (byte)'I',
                (byte)'F',
                (byte)'8',
                (byte)'9',
                (byte)'a',
                0x00
            };
        }

        // Reproduce the original logic (allocates Dictionary/List/byte[] each call)
        private bool OriginalImplementation(byte[] content, string fileName)
        {
            var imageSignatures = new Dictionary<string, List<byte[]>>
            {
                {
                    ".jpg",
                    new List<byte[]>
                    {
                        new byte[]
                        {
                            0xFF,
                            0xD8,
                            0xFF
                        }
                    }
                },
                {
                    ".jpeg",
                    new List<byte[]>
                    {
                        new byte[]
                        {
                            0xFF,
                            0xD8,
                            0xFF
                        }
                    }
                },
                {
                    ".png",
                    new List<byte[]>
                    {
                        new byte[]
                        {
                            0x89,
                            0x50,
                            0x4E,
                            0x47,
                            0x0D,
                            0x0A,
                            0x1A,
                            0x0A
                        }
                    }
                },
                {
                    ".gif",
                    new List<byte[]>
                    {
                        new byte[]
                        {
                            (byte)'G',
                            (byte)'I',
                            (byte)'F',
                            (byte)'8'
                        }
                    }
                }
            };
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            if (!imageSignatures.TryGetValue(extension, out var signatures))
            {
                return false;
            }

            using var ms = new MemoryStream(content);
            using var reader = new BinaryReader(ms);
            var maxSignatureLength = signatures.Max(s => s.Length);
            var headerBytes = reader.ReadBytes(maxSignatureLength);
            var isValid = signatures.Any(signature => headerBytes.Length >= signature.Length && headerBytes.Take(signature.Length).SequenceEqual(signature));
            return isValid;
        }

        // Optimized version: cache signatures, use Span and MemoryStream.Read(Span<byte>) to avoid allocations
        private static readonly Dictionary<string, byte[][]> _signatureCache = new()
        {
            {
                ".jpg",
                new byte[][]
                {
                    new byte[]
                    {
                        0xFF,
                        0xD8,
                        0xFF
                    }
                }
            },
            {
                ".jpeg",
                new byte[][]
                {
                    new byte[]
                    {
                        0xFF,
                        0xD8,
                        0xFF
                    }
                }
            },
            {
                ".png",
                new byte[][]
                {
                    new byte[]
                    {
                        0x89,
                        0x50,
                        0x4E,
                        0x47,
                        0x0D,
                        0x0A,
                        0x1A,
                        0x0A
                    }
                }
            },
            {
                ".gif",
                new byte[][]
                {
                    new byte[]
                    {
                        (byte)'G',
                        (byte)'I',
                        (byte)'F',
                        (byte)'8'
                    }
                }
            }
        };
        private bool OptimizedImplementation(byte[] content, string fileName)
        {
            var extension = Path.GetExtension(fileName).ToLowerInvariant();
            if (!_signatureCache.TryGetValue(extension, out var signatures))
            {
                return false;
            }

            var maxSig = signatures.Max(s => s.Length);
            // use stackalloc for small sizes to avoid heap allocs
            Span<byte> headerSpan = maxSig <= 128 ? stackalloc byte[128].Slice(0, maxSig) : new byte[maxSig];
            using var ms = new MemoryStream(content);
            // MemoryStream.Read(Span<byte>) available on .NET Core
            int read = ms.Read(headerSpan);
            if (read == 0)
                return false;
            foreach (var sig in signatures)
            {
                if (read >= sig.Length)
                {
                    if (headerSpan.Slice(0, sig.Length).SequenceEqual(sig))
                        return true;
                }
            }

            return false;
        }

        [BenchmarkDotNet.Attributes.Benchmark(Baseline = true)]
        public bool Original_Jpg() => OriginalImplementation(jpgHeader, jpgName);
        [BenchmarkDotNet.Attributes.Benchmark]
        public bool Optimized_Jpg() => OptimizedImplementation(jpgHeader, jpgName);
        [BenchmarkDotNet.Attributes.Benchmark]
        public bool Original_Png() => OriginalImplementation(pngHeader, pngName);
        [BenchmarkDotNet.Attributes.Benchmark]
        public bool Optimized_Png() => OptimizedImplementation(pngHeader, pngName);
        [BenchmarkDotNet.Attributes.Benchmark]
        public bool Original_Gif() => OriginalImplementation(gifHeader, gifName);
        [BenchmarkDotNet.Attributes.Benchmark]
        public bool Optimized_Gif() => OptimizedImplementation(gifHeader, gifName);
    }
}