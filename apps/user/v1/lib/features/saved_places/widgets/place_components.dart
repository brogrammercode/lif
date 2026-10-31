import 'package:flutter/material.dart';
import 'package:user/components/ui/app_skeleton.dart';
import 'package:user/components/ui/glass_chip.dart';
import 'package:user/components/ui/liquid_glass.dart';
import 'package:user/features/rides/ride_display.dart';
import 'package:user/features/saved_places/place_display.dart';

class PlacePhoto extends StatelessWidget {
  final String? url;
  final double height;
  const PlacePhoto({super.key, this.url, this.height = 130});
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
                  : const AppSkeleton(child: SkeletonBox(height: 130)),
              errorBuilder: (_, error, stack) => _empty(failed: true),
            ),
    ),
  );
  Widget _empty({bool failed = false}) => LiquidGlassSurface(
    radius: 18,
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.photo_outlined, color: GlassTokens.accent, size: 28),
        const SizedBox(height: 6),
        Text(
          failed ? 'Photo unavailable' : 'No photos yet',
          style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
        ),
      ],
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
            style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
          ),
        ),
    ],
  );
}

class PlaceCard extends StatelessWidget {
  final Map<String, dynamic> place;
  final VoidCallback? onTap;
  const PlaceCard({super.key, required this.place, this.onTap});
  @override
  Widget build(BuildContext context) {
    final photos = placePhotos(place);
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
  Widget build(BuildContext context) => SizedBox(
    width: 32,
    height: 32,
    child: LiquidGlassSurface(
      radius: 99,
      padding: EdgeInsets.zero,
      child: person['avatar_url'] is String
          ? ClipOval(
              child: Image.network(
                '${person['avatar_url']}',
                fit: BoxFit.cover,
                cacheWidth: 96,
                cacheHeight: 96,
                errorBuilder: (_, error, stack) => const Icon(
                  Icons.person_outline,
                  size: 18,
                  color: GlassTokens.accent,
                ),
              ),
            )
          : const Icon(
              Icons.person_outline,
              size: 18,
              color: GlassTokens.accent,
            ),
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
    return LiquidGlassSurface(
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
            const Icon(Icons.check_circle_outline, color: GlassTokens.accent),
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
                color: GlassTokens.muted,
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
  Widget build(BuildContext context) => LiquidGlassSurface(
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
                  color: GlassTokens.ink,
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
                color: GlassTokens.accent,
              ),
            ),
            Text(
              rideTime(review['updated_at'] ?? review['created_at']),
              style: const TextStyle(fontSize: 12, color: GlassTokens.muted),
            ),
          ],
        ),
        const SizedBox(height: 10),
        Text(
          '${review['comment'] ?? ''}',
          style: const TextStyle(
            fontSize: 14,
            height: 1.5,
            color: GlassTokens.ink,
          ),
        ),
      ],
    ),
  );
}

class PlaceCardSkeleton extends StatelessWidget {
  const PlaceCardSkeleton({super.key});
  @override
  Widget build(BuildContext context) => const LiquidGlassSurface(
    child: AppSkeleton(
      label: 'Loading places',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          SkeletonBox(height: 114),
          SizedBox(height: 16),
          SkeletonBox(width: 170, height: 18),
          SizedBox(height: 10),
          SkeletonBox(height: 14),
          SizedBox(height: 16),
          SkeletonBox(width: 130, height: 38),
        ],
      ),
    ),
  );
}
