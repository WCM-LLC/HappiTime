import Foundation

protocol KeyValueStore {
    func data(forKey key: String) -> Data?
    func setData(_ value: Data, forKey key: String)
    func removeValue(forKey key: String)
}

extension UserDefaults: KeyValueStore {
    func setData(_ value: Data, forKey key: String) {
        set(value, forKey: key)
    }

    func removeValue(forKey key: String) {
        removeObject(forKey: key)
    }
}
