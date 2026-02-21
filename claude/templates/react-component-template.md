# Component: [Name]

## Responsibility

One sentence. What is the single job of this component?

## Props

```typescript
interface [Name]Props {
  // required
  id: string;

  // optional
  onSuccess?: () => void;
}
```

## State

What local state does this component own, if any?

```typescript
const [isOpen, setIsOpen] = useState(false);
```

If server state is needed, note the query key and data shape:

```typescript
// useQuery key: ['transactions', filters]
// data shape: { data: Transaction[], meta: PaginationMeta }
```

## Side Effects

- On mount: fetch X
- On `id` change: refetch Y
- On submit: invalidate query Z

## Error Handling

- API error → show inline error message, do not crash
- Empty state → render `<EmptyState />` with a CTA
- Loading → render `<Skeleton />` or spinner

## Performance Notes

- Does this render often? If so, wrap in `React.memo`?
- Does it render a large list? Use virtualization if > 100 items.
- Are there expensive calculations? Use `useMemo`.

## Tests

- [ ] Renders without crashing with minimal props
- [ ] Shows loading state while fetching
- [ ] Shows error state on API failure
- [ ] Shows empty state when data is empty
- [ ] [Key interaction] works correctly
