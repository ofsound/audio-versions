import AVKit
import SwiftUI

struct AudioRoutePicker: UIViewRepresentable {
    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.prioritizesVideoDevices = false
        picker.activeTintColor = .systemOrange
        picker.tintColor = .secondaryLabel
        return picker
    }

    func updateUIView(_ view: AVRoutePickerView, context: Context) {}
}
