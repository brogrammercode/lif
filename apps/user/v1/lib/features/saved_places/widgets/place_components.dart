import 'package:flutter/material.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/components/ui/solid_ui.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/place_display.dart';

class PlacePhoto extends StatelessWidget {
  final String? url;
  final double height;
  final bool showLabel;
  const PlacePhoto({
    super.key,
    this.url,
    this.height = 130,
    this.showLabel = true,
  });
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(18),
    child: SizedBox(
      height: height,
      width: double.infinity,
      child: url == null
          ? _empty()
          : Image.network(
              url!,
              fit: BoxFit.cover,
              cacheWidth: 900,
              cacheHeight: 600,
              loadingBuilder: (_, child, progress) => progress == null
                  ? child
                  : Container(
                      color: const Color(0xFFF2F2F2),
                      alignment: Alignment.center,
                      child: const SizedBox.square(
                        dimension: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
              errorBuilder: (_, error, stack) => _empty(failed: true),
            ),
    ),
  );
  Widget _empty({bool failed = false}) => Container(
    decoration: BoxDecoration(
      color: const Color(0xFFF3F3F3),
      borderRadius: BorderRadius.circular(18),
    ),
    padding: const EdgeInsets.all(8),
    child: LayoutBuilder(
      builder: (context, bounds) {
        final label = failed ? 'Photo unavailable' : 'No photos yet';
        final labelFits =
            bounds.maxHeight >=
            34 + MediaQuery.textScalerOf(context).scale(12) * 1.35 * 2;
        return Semantics(
          label: label,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.photo_outlined,
                color: RideTokens.muted,
                size: bounds.biggest.shortestSide.clamp(0, 28).toDouble(),
              ),
              if (showLabel && labelFits) ...[
                const SizedBox(height: 6),
                Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    fontSize: 12,
                    height: 1.35,
                    color: RideTokens.muted,
                  ),
                ),
              ],
            ],
          ),
        );
      },
    ),
  );
}

class PlaceGallery extends StatefulWidget {
  final List<String> photos;
  const PlaceGallery({super.key, required this.photos});
  @override
  State<PlaceGallery> createState() => _GalleryState();
}

class _GalleryState extends State<PlaceGallery> {
  final _controller = PageController(viewportFraction: .93);
  int _page = 0;
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Column(
    children: [
      SizedBox(
        height: 190,
        child: widget.photos.isEmpty
            ? const Padding(
                padding: EdgeInsets.symmetric(horizontal: 20),
                child: PlacePhoto(height: 190),
              )
            : PageView.builder(
                controller: _controller,
                itemCount: widget.photos.length,
                onPageChanged: (page) => setState(() => _page = page),
                itemBuilder: (_, index) => Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 5),
                  child: PlacePhoto(url: widget.photos[index], height: 190),
                ),
              ),
      ),
      if (widget.photos.length > 1)
        Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Text(
            '${(_page + 1).clamp(1, widget.photos.length)} / ${widget.photos.length} photos',
            style: const TextStyle(fontSize: 12, color: RideTokens.muted),
          ),
        ),
    ],
  );
}

class PlaceCard extends StatelessWidget {
  final Map<String, dynamic> place;
  final VoidCallback? onTap;
  final VoidCallback? onEdit;
  final bool compact;
  final bool tilted;
  const PlaceCard({
    super.key,
    required this.place,
    this.onTap,
    this.onEdit,
    this.compact = false,
    this.tilted = true,
  });
  static double compactHeight(BuildContext context) {
    return 146;
  }

  @override
  Widget build(BuildContext context) {
    final photos = placePhotos(place);
    if (compact) {
      final rating = double.tryParse('${place['rating'] ?? ''}');
      final reviewCount = int.tryParse('${place['review_count'] ?? ''}') ?? 0;
      return SizedBox(
        height: compactHeight(context),
        child: Material(
          color: Colors.white,
          borderRadius: BorderRadius.circular(18),
          clipBehavior: Clip.antiAlias,
          child: InkWell(
            onTap: onTap,
            child: Stack(
              fit: StackFit.expand,
              children: [
                PlacePhoto(
                  url: photos.firstOrNull,
                  height: compactHeight(context),
                  showLabel: false,
                ),
                Positioned(
                  left: tilted ? 34 : MediaQuery.sizeOf(context).width * .36,
                  right: 7,
                  top: tilted ? 8 : 66,
                  bottom: 8,
                  child: Transform.rotate(
                    angle: tilted ? -.055 : 0,
                    child: Container(
                      padding: EdgeInsets.symmetric(
                        horizontal: tilted ? 12 : 10,
                        vertical: tilted ? 10 : 8,
                      ),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(15),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x26000000),
                            blurRadius: 12,
                            offset: Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: tilted
                            ? CrossAxisAlignment.start
                            : CrossAxisAlignment.stretch,
                        mainAxisAlignment: tilted
                            ? MainAxisAlignment.center
                            : MainAxisAlignment.end,
                        children: tilted
                            ? [
                                Row(
                                  children: [
                                    Icon(
                                      placeIcon(place),
                                      size: 14,
                                      color: const Color(0xFF78933A),
                                    ),
                                    const SizedBox(width: 4),
                                    Expanded(
                                      child: Text(
                                        placeType(place),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 11,
                                          fontWeight: FontWeight.w500,
                                          color: RideTokens.muted,
                                        ),
                                      ),
                                    ),
                                    if (rating != null && rating > 0) ...[
                                      const Icon(
                                        Icons.star_rounded,
                                        size: 14,
                                        color: Color(0xFF9EBB3B),
                                      ),
                                      Text(
                                        '${rating.toStringAsFixed(1)}${reviewCount > 0 ? ' ($reviewCount)' : ''}',
                                        maxLines: 1,
                                        overflow: TextOverflow.clip,
                                        style: const TextStyle(
                                          fontSize: 10,
                                          fontWeight: FontWeight.w500,
                                          color: RideTokens.ink,
                                        ),
                                      ),
                                    ],
                                  ],
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  placeName(place),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.15,
                                    fontWeight: FontWeight.w500,
                                    color: RideTokens.ink,
                                  ),
                                ),
                                const SizedBox(height: 3),
                                Text(
                                  '${place['address'] ?? ''}',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    height: 1.2,
                                    color: RideTokens.muted,
                                  ),
                                ),
                              ]
                            : [
                                Text(
                                  placeName(place),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 14,
                                    height: 1.12,
                                    fontWeight: FontWeight.w500,
                                    color: RideTokens.ink,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  '${place['address'] ?? ''}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontSize: 10,
                                    height: 1.1,
                                    color: RideTokens.muted,
                                  ),
                                ),
                                const SizedBox(height: 5),
                                Align(
                                  alignment: Alignment.centerRight,
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      Icon(
                                        placeIcon(place),
                                        size: 12,
                                        color: const Color(0xFF78933A),
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        placeType(place),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          fontSize: 10,
                                          height: 1,
                                          fontWeight: FontWeight.w500,
                                          color: RideTokens.muted,
                                        ),
                                      ),
                                      if (rating != null && rating > 0) ...[
                                        const SizedBox(width: 8),
                                        const Icon(
                                          Icons.star_rounded,
                                          size: 12,
                                          color: Color(0xFF9EBB3B),
                                        ),
                                        Text(
                                          rating.toStringAsFixed(1),
                                          style: const TextStyle(
                                            fontSize: 10,
                                            fontWeight: FontWeight.w500,
                                            color: RideTokens.ink,
                                          ),
                                        ),
                                      ],
                                    ],
                                  ),
                                ),
                              ],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 7,
                  bottom: 9,
                  child: Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                      border: Border.all(color: RideTokens.line),
                    ),
                    child: Icon(
                      placeIcon(place),
                      size: 15,
                      color: RideTokens.ink,
                    ),
                  ),
                ),
                if (onEdit != null)
                  Positioned(
                    top: 7,
                    right: 7,
                    child: Material(
                      color: Colors.white,
                      shape: const CircleBorder(),
                      child: SizedBox.square(
                        dimension: 36,
                        child: IconButton(
                          tooltip: 'Edit place',
                          onPressed: onEdit,
                          padding: EdgeInsets.zero,
                          icon: const Icon(Icons.edit_outlined, size: 17),
                          visualDensity: VisualDensity.compact,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
    }
    return LiquidGlassSurface(
      padding: EdgeInsets.zero,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              PlacePhoto(url: photos.firstOrNull, height: 114),
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      placeName(place),
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                        color: GlassTokens.ink,
                      ),
                    ),
                  ),
                  if (onTap != null)
                    const Padding(
                      padding: EdgeInsets.only(left: 8),
                      child: Icon(
                        Icons.arrow_forward,
                        size: 20,
                        color: GlassTokens.accent,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                '${place['address'] ?? ''}',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 12,
                  height: 1.4,
                  color: GlassTokens.muted,
                ),
              ),
              const SizedBox(height: 12),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  LiquidGlassChip(
                    label: placeType(place),
                    icon: placeIcon(place),
                  ),
                  if (place['visited_at'] != null)
                    const LiquidGlassChip(label: 'Visited', icon: Icons.check),
                  if (place['saved'] == true && place['visited_at'] == null)
                    const LiquidGlassChip(
                      label: 'Saved',
                      icon: Icons.bookmark_outline,
                    ),
                  if ((rideNumber(place['review_count']) ?? 0) > 0 &&
                      rideNumber(place['rating']) != null)
                    LiquidGlassChip(
                      label:
                          '${rideNumber(place['rating'])!.toStringAsFixed(1)} (${place['review_count']})',
                      icon: Icons.star_outline,
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class PlaceAvatar extends StatelessWidget {
  final Map<String, dynamic> person;
  const PlaceAvatar(this.person, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    width: 32,
    height: 32,
    padding: const EdgeInsets.all(1.5),
    decoration: BoxDecoration(
      color: Colors.white,
      shape: BoxShape.circle,
      border: Border.all(color: RideTokens.line),
    ),
    child: ClipOval(
      child: person['avatar_url'] is String
          ? Image.network(
              '${person['avatar_url']}',
              fit: BoxFit.cover,
              cacheWidth: 96,
              cacheHeight: 96,
              errorBuilder: (_, error, stack) => const Icon(
                Icons.person_outline,
                size: 18,
                color: RideTokens.muted,
              ),
            )
          : const Icon(Icons.person_outline, size: 18, color: RideTokens.muted),
    ),
  );
}

class PlaceVisitors extends StatelessWidget {
  final Map<String, dynamic> place;
  const PlaceVisitors(this.place, {super.key});
  @override
  Widget build(BuildContext context) {
    final visitors = rideMaps(place['visitors']);
    final count = (rideNumber(place['visitor_count']) ?? 0).toInt();
    final names = visitors
        .take(2)
        .map((v) => placePerson(rideMap(v['user'])))
        .join(', ');
    return SolidSurface(
      child: Row(
        children: [
          if (visitors.isNotEmpty) ...[
            SizedBox(
              width: 32 + (visitors.length.clamp(1, 3) - 1) * 20,
              height: 32,
              child: Stack(
                children: [
                  for (var i = 0; i < visitors.length && i < 3; i++)
                    Positioned(
                      left: i * 20,
                      child: PlaceAvatar(rideMap(visitors[i]['user'])),
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
          ] else ...[
            const Icon(Icons.check_circle_outline, color: RideTokens.muted),
            const SizedBox(width: 10),
          ],
          Expanded(
            child: Text(
              count == 0
                  ? 'No visits yet. Mark your visit when you have been here.'
                  : 'Visited by $names${count > 2 ? ' and ${count - 2} more' : ''}',
              style: const TextStyle(
                fontSize: 13,
                height: 1.5,
                color: RideTokens.muted,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class PlaceReviewCard extends StatelessWidget {
  final Map<String, dynamic> review;
  const PlaceReviewCard(this.review, {super.key});
  @override
  Widget build(BuildContext context) => SolidSurface(
    margin: const EdgeInsets.only(bottom: 12),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            PlaceAvatar(rideMap(review['user'])),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                placePerson(rideMap(review['user'])),
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: RideTokens.ink,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          runSpacing: 6,
          children: [
            Text(
              '${review['score']}/5',
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: RideTokens.ink,
              ),
            ),
            Text(
              rideTime(review['updated_at'] ?? review['created_at']),
              style: const TextStyle(fontSize: 12, color: RideTokens.muted),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          '${review['comment'] ?? ''}',
          style: const TextStyle(
            fontSize: 14,
            height: 1.5,
            color: RideTokens.ink,
          ),
        ),
      ],
    ),
  );
}

class PlaceCardSkeleton extends StatelessWidget {
  const PlaceCardSkeleton({super.key});
  @override
  Widget build(BuildContext context) => const SolidSurface(
    padding: EdgeInsets.symmetric(horizontal: 14, vertical: 13),
    child: Row(
      children: [
        SizedBox.square(
          dimension: 20,
          child: CircularProgressIndicator(strokeWidth: 2),
        ),
        SizedBox(width: 10),
        Text('Loading places', style: TextStyle(fontSize: 13)),
      ],
    ),
  );
}
