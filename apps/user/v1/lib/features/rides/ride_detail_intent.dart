/// Existing links still pass a plain ride ID. Receipt links carry the same
/// opaque reference plus a presentation intent, never a cached trip snapshot.
class RideDetailIntent {
  final String id;
  final bool receipt;
  const RideDetailIntent(this.id, {this.receipt = false});
}
