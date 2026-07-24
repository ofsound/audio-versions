import AVKit
import SwiftUI

struct AudioRoutePicker: UIViewRepresentable {
    @Environment(\.palette) private var palette

    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.prioritizesVideoDevices = false
        applyTints(to: picker)
        return picker
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {
        applyTints(to: view)
    }

    private func applyTints(to picker: AVRoutePickerView) {
        picker.activeTintColor = UIColor(palette.accent)
        picker.tintColor = UIColor(palette.textSecondary)
    }
}
