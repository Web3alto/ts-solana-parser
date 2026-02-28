export class Deque<T> {
  private data: T[] = []
  private head = 0

  get size(): number {
    return this.data.length - this.head
  }

  push(item: T): void {
    this.data.push(item)
  }

  shift(): T | undefined {
    if (this.head >= this.data.length) return undefined
    const item = this.data[this.head]
    this.data[this.head] = undefined as unknown as T // release reference for GC
    this.head++

    if (this.head > 1024 && this.head * 2 > this.data.length) {
      this.data = this.data.slice(this.head)
      this.head = 0
    }

    return item
  }

  clear(): void {
    this.data = []
    this.head = 0
  }
}
