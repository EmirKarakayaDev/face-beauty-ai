export type FaceShape =
  | "oval"
  | "yuvarlak"
  | "uzun"
  | "kare"
  | "elmas"
  | "ters_ucgen";

export type SkinTone = "açık" | "orta" | "koyu";

export interface BrowRecommendation {
  name: string;
  description: string;
  shape: "dogal" | "yuksek_kavis" | "duz" | "ince" | "kavisli" | "kalkik";
  tip: string;
}

export interface EyelinerRecommendation {
  name: string;
  description: string;
  style: "ince_dogal" | "klasik" | "cat_eye" | "alt_hat" | "dramatik";
  tip: string;
}

export interface LipRecommendation {
  name: string;
  description: string;
  style: "dogal" | "belirgin_cupid" | "dolu" | "uzatilmis" | "yuvarlak";
  tip: string;
}

export interface CatalogEntry {
  faceShape: FaceShape;
  faceShapeLabel: string;
  faceShapeDesc: string;
  brow: BrowRecommendation;
  eyeliner: EyelinerRecommendation;
  lip: LipRecommendation;
}

export const catalog: Record<FaceShape, CatalogEntry> = {
  oval: {
    faceShape: "oval",
    faceShapeLabel: "Oval Yüz",
    faceShapeDesc:
      "Dengeli oranları olan oval yüz, hemen her tasarıma uygundur. Doğal hatlar sizi en iyi yansıtır.",
    brow: {
      name: "Standart / Doğal Kaş",
      description:
        "Kaşlarınızın doğal yapısına sadık kalınması yüz şeklinizi dengeler. Hafif kavis veya düz tercih edilebilir.",
      shape: "dogal",
      tip: "Kaş başlangıcını burun kanadıyla hizalayın, tepesini göz bebeğinin dış kenarına getirin.",
    },
    eyeliner: {
      name: "Klasik İnce Hat",
      description:
        "Üst göz kapağına ince, düz bir eyeliner hattı oval yüzü dengeler ve gözleri ön plana çıkarır.",
      style: "klasik",
      tip: "İç köşeden dış köşeye doğru ince bir hat çizin, dış köşede hafifçe yukarı kıvırın.",
    },
    lip: {
      name: "Doğal Dolgu",
      description:
        "Oval yüzde dudakların doğal hatlarını belirginleştirmek yeterlidir. Aşırı dolgu gereksinim yoktur.",
      style: "dogal",
      tip: "Dudak kalemi ile doğal hattı izleyin, ortayı hafifçe vurgulayın.",
    },
  },

  yuvarlak: {
    faceShape: "yuvarlak",
    faceShapeLabel: "Yuvarlak Yüz",
    faceShapeDesc:
      "Yüz genişliği ve uzunluğu birbirine yakın, çenesi yumuşak hatlardan oluşur. Yüksek açılı tasarımlar uzatıcı etki yaratır.",
    brow: {
      name: "Avrupa Tarzı Yüksek Kavis",
      description:
        "Daha belirgin ve hacimli kaşlar, yüz hatlarınızı daha uzun ve dengeli gösterir.",
      shape: "yuksek_kavis",
      tip: "Kaş tepesini normalden biraz daha yükseğe ve daha sivri yapın. Kaş başı ile sonu arasındaki farkı artırın.",
    },
    eyeliner: {
      name: "Cat Eye",
      description:
        "Dış köşeden yukarı çekilen cat-eye hattı gözleri badem biçimine sokar ve yüzü uzatır.",
      style: "cat_eye",
      tip: "İç köşeden başlayıp dış köşede belirgin şekilde yukarı doğru çekin. Burun yönünde değil, şakak yönünde uzatın.",
    },
    lip: {
      name: "Belirgin Cupid's Bow",
      description:
        "Üst dudakta belirgin bir ok şekli (Cupid's bow) yüze dikey hareket katar.",
      style: "belirgin_cupid",
      tip: "Üst dudak ortasını belirginleştirin, köşeleri hafifçe aşağıda bırakın.",
    },
  },

  uzun: {
    faceShape: "uzun",
    faceShapeLabel: "Uzun Yüz",
    faceShapeDesc:
      "Yüz uzunluğu genişliğinden belirgin biçimde fazla. Yatay etkili tasarımlar yüzü dengeler.",
    brow: {
      name: "Düz Kaşlar",
      description:
        "Düz kaşlar, yüzünüzün uzunluğunu görsel olarak kısaltarak daha dengeli bir görünüm sağlar.",
      shape: "duz",
      tip: "Kaş tepesini mümkün olduğunca düz tutun, yukarı kıvırma yapmayın.",
    },
    eyeliner: {
      name: "Alt Hat + Smoky",
      description:
        "Alt göz kapağına da eyeliner uygulamak gözü genişletir, yüz uzunluğunun etkisini azaltır.",
      style: "alt_hat",
      tip: "Üst hattı kalın tutun, alt kapağa da ince bir hat çekin. İkisi dış köşede buluşsun.",
    },
    lip: {
      name: "Uzatılmış Dolu Dudak",
      description:
        "Dudakları yanlara doğru uzatmak yatay bir denge oluşturur.",
      style: "uzatilmis",
      tip: "Dudak kalemini doğal hattın biraz dışına taşıyarak yanlamasına genişletin.",
    },
  },

  kare: {
    faceShape: "kare",
    faceShapeLabel: "Kare Yüz",
    faceShapeDesc:
      "Alın, elmacık ve çene genişliği birbirine yakın, çene köşeleri belirgin. Yumuşak hatlar köşeleri dengeler.",
    brow: {
      name: "Kavisli Kaşlar",
      description:
        "Kavisli kaşlar yüz hatlarınıza yumuşaklık kazandırır ve köşeli yapıyı dengeler.",
      shape: "kavisli",
      tip: "Kaş tepesini orta-dış bölgede konumlandırın, her iki uçtan da nazikçe kıvırın.",
    },
    eyeliner: {
      name: "Dramatik Üst Hat",
      description:
        "Kalın üst hat ve hafif yükselen dış köşe çene hatlarından dikkati yukarı çeker.",
      style: "dramatik",
      tip: "Üst hattı orta kısımda kalınlaştırın. Dış köşeyi çok keskin değil, yuvarlak bitirin.",
    },
    lip: {
      name: "Yuvarlak Dolu Dudak",
      description:
        "Yuvarlak dolgu yüzün sert hatlarını yumuşatır.",
      style: "yuvarlak",
      tip: "Köşeleri keskin bırakmak yerine dolgu orta ve üst bölgede yoğunlaştırın.",
    },
  },

  elmas: {
    faceShape: "elmas",
    faceShapeLabel: "Elmas Yüz",
    faceShapeDesc:
      "Elmacık kemikleri en geniş bölge, alın ve çene daha dar. İnce ve yumuşak tasarımlar elmacıkları dengeler.",
    brow: {
      name: "İnce ve Yumuşak Kaşlar",
      description:
        "Daha küçük ve yumuşak kaş şekilleri elmacık kemiklerinizi vurgular, yüzünüzü daha yumuşak gösterir.",
      shape: "ince",
      tip: "Kaşı ince tutun, tepesini çok sivri yapmayın. Kaş başı ve sonu arasında akıcı bir geçiş sağlayın.",
    },
    eyeliner: {
      name: "İnce Doğal Hat",
      description:
        "Göz üstüne ince bir hat ve hafif iç köşe vurgusu elmacıkların üstüne dikkat çeker.",
      style: "ince_dogal",
      tip: "İnce ve düz bir hat çizin. İç köşeye küçük bir accent ekleyebilirsiniz.",
    },
    lip: {
      name: "Doğal Dolgu",
      description:
        "Dudakları doğal hatta bırakmak elmas yüz şeklinin dengesini korur.",
      style: "dogal",
      tip: "Dudak kalemini doğal hattın içinde tutun, aşırı büyütmekten kaçının.",
    },
  },

  ters_ucgen: {
    faceShape: "ters_ucgen",
    faceShapeLabel: "Ters Üçgen Yüz",
    faceShapeDesc:
      "Alın geniş, çene sivri ve dar. Yukarı kalkık hatlar çene hattından dikkati dağıtır.",
    brow: {
      name: "Kalkık Kaşlar",
      description:
        "Yükselen kaşlar yüz hatlarınızı dengeler ve çene hattının belginliğini azaltır.",
      shape: "kalkik",
      tip: "Kaş başını biraz yüksek tutun, dış ucu aşağıya düşürmeyin. Kaşı ortadan sonuna doğru hafifçe kaldırın.",
    },
    eyeliner: {
      name: "Cat Eye — Hafif",
      description:
        "Hafif cat-eye gözleri genişletir ve dar çeneden dikkati yukarıya taşır.",
      style: "cat_eye",
      tip: "Keskin bir açı yerine nazik, yukarı doğru hafif kıvrılan bir hat çizin.",
    },
    lip: {
      name: "Dolu Merkez Dolgu",
      description:
        "Dudak ortasını doldurarak dikkat çene hattından uzaklaşır.",
      style: "dolu",
      tip: "Üst ve alt dudak ortasını vurgulayın, köşeleri doğal bırakın.",
    },
  },
};

export function getRecommendation(faceShape: FaceShape): CatalogEntry {
  return catalog[faceShape];
}
