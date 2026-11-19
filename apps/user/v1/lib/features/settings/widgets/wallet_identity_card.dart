import 'package:flutter/material.dart';
import 'package:user/constants/app.constant.dart';

/// The shared visual wallet card used on the wallet page and payment picker.
class WalletIdentityCard extends StatelessWidget {
  final String walletId;
  final String cardholder;
  final String expiry;

  const WalletIdentityCard({
    super.key,
    required this.walletId,
    required this.cardholder,
    required this.expiry,
  });

  static const _cardText = TextStyle(
    color: Colors.white,
    fontFamily: 'monospace',
    fontFamilyFallback: ['Menlo', 'Courier New'],
    fontSize: 14,
    fontWeight: FontWeight.w600,
    letterSpacing: 1.2,
  );

  @override
  Widget build(BuildContext context) => Stack(
    children: [
      Positioned.fill(
        left: 14,
        right: 14,
        top: 24,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: const Color(0xFF313F91),
            borderRadius: BorderRadius.circular(20),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: DecoratedBox(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF5E6A97)),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color(0xFF111A30),
                  Color(0xFF283A82),
                  Color(0xFF2B5276),
                ],
              ),
            ),
            child: Stack(
              children: [
                const Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: RadialGradient(
                        center: Alignment(1.08, -1),
                        radius: .95,
                        colors: [Color(0xFF80D783), Color(0x0080D783)],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  right: -32,
                  bottom: -57,
                  child: ExcludeSemantics(
                    child: Transform.rotate(
                      angle: -.24,
                      child: const Text(
                        '1',
                        style: TextStyle(
                          color: Color(0x2868F4C9),
                          fontSize: 228,
                          height: 1,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 24, 22, 24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _WalletLogo(),
                          ExcludeSemantics(
                            child: Icon(
                              Icons.contactless_outlined,
                              color: Colors.white,
                              size: 28,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 22),
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: ExcludeSemantics(
                          child: DecoratedBox(
                            decoration: BoxDecoration(
                              color: Color(0xFFF0D89E),
                              borderRadius: BorderRadius.all(
                                Radius.circular(7),
                              ),
                            ),
                            child: SizedBox(
                              width: 46,
                              height: 34,
                              child: Icon(
                                Icons.memory_rounded,
                                size: 25,
                                color: Color(0xFF79643B),
                              ),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 30),
                      Text(
                        walletId,
                        semanticsLabel: 'Wallet ID $walletId',
                        style: _cardText.copyWith(
                          fontSize: 22,
                          letterSpacing: 1.6,
                        ),
                      ),
                      const SizedBox(height: 17),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: Text(cardholder, style: _cardText)),
                          const SizedBox(width: 16),
                          Text(
                            expiry,
                            semanticsLabel: 'Preview expiry $expiry',
                            style: _cardText,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    ],
  );
}

class _WalletLogo extends StatelessWidget {
  const _WalletLogo();

  @override
  Widget build(BuildContext context) => ClipRect(
    child: SizedBox(
      width: 128,
      height: 28,
      child: OverflowBox(
        minHeight: 128,
        maxHeight: 128,
        child: ColorFiltered(
          colorFilter: const ColorFilter.matrix([
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1,
            0,
            0,
            0,
            0,
            0,
            1.25,
            -14,
          ]),
          child: Image.asset(
            AppConstants.APP_LOGO_ASSET,
            width: 128,
            height: 128,
            excludeFromSemantics: true,
          ),
        ),
      ),
    ),
  );
}
