export const SAMPLE_CODE = `def greet(name):
    if not name:
        return "Hello, stranger!"
    return f"Hello, {name}!"


def count_votes(items):
    total = 0
    for item in items:
        if item:
            total = total + 1
    return total


def main():
    message = greet("Defend")
    print(message)
    votes = [True, False, True, True]
    yes = count_votes(votes)
    print("Yes votes:", yes)
    empty = count_votes([])
    print("Empty list:", empty)


if __name__ == "__main__":
    main()
`;

export const RUNNABLE_SAMPLE = `x = 1
y = 2
total = x + y
print("total =", total)
for i in range(3):
    total = total + i
    print("step", i, "->", total)
`;
