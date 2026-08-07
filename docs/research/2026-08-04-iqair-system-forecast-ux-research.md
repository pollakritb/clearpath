# IQAir System, Forecast, Data Network, and UX/UI Research

> วันที่วิจัย: 4 สิงหาคม 2026
> วัตถุประสงค์: ศึกษาระบบ IQAir/AirVisual เพื่อทำความเข้าใจว่าแพลตฟอร์มรวบรวมจุดตรวจวัดจำนวนมากได้อย่างไร ประมวลผลและพยากรณ์อย่างไร ออกแบบ UX/UI แบบใด และส่วนใดเหมาะที่จะนำมาประยุกต์ใช้กับ ClearPath
> ขอบเขต: เอกสารสาธารณะของ IQAir, Knowledge Base, เอกสารผลิตภัณฑ์, App Store และรายงานคุณภาพอากาศของ IQAir

## 1. Executive summary

IQAir ไม่ใช่เพียงผู้ผลิตเครื่องตรวจวัด แต่เป็นแพลตฟอร์มที่รวม 3 ระบบเข้าด้วยกัน:

1. เครือข่ายรับข้อมูลจากสถานีรัฐบาล เซนเซอร์ IQAir เซนเซอร์ภายนอก และข้อมูลแบบจำลอง
2. ระบบปรับแก้ ตรวจคุณภาพ รวมข้อมูล และคำนวณ AQI/forecast
3. ผลิตภัณฑ์สำหรับผู้ใช้ ซึ่งนำข้อมูลระดับสถานี เมือง ค่าประมาณ และพยากรณ์มาแสดงร่วมกัน

สาเหตุที่แผนที่ IQAir มีจุดจำนวนมาก ไม่ได้มาจากการติดตั้งสถานีของ IQAir เองทั้งหมด แต่เกิดจากการรวมเครือข่ายหลายแหล่ง รองรับอุปกรณ์บุคคลที่สาม เปิดให้ชุมชนและองค์กรร่วมเผยแพร่ข้อมูล ให้เครดิต contributor และใช้ข้อมูลดาวเทียมหรือแบบจำลองเติมพื้นที่ที่ไม่มีสถานี

คำว่า `station`, `sensor` และ `location` ที่ IQAir ใช้ในแต่ละหน้าไม่ใช่หน่วยเดียวกัน ตัวเลขทางการที่ปรากฏในสื่อของ IQAir จึงไม่ควรถูกนำมาเทียบกันตรง ๆ:

- หน้า Data Computation ระบุข้อมูลจากมากกว่า 30,000 สถานี
- หน้าแพลตฟอร์มบางส่วนกล่าวถึงมากกว่า 80,000 monitoring sensors
- App Store ระบุมากกว่า 500,000 locations ในมากกว่า 100 ประเทศ

จำนวน location จึงไม่เท่ากับจำนวนสถานีตรวจวัดจริง เพราะ location อาจเป็นเมือง สถานที่ จุดที่ผูกกับสถานี หรือจุดที่ใช้ค่าประมาณ

## 2. ระดับความมั่นใจและข้อจำกัดของงานวิจัย

เอกสารนี้แยกข้อมูลออกเป็น 3 ระดับ:

- **ข้อมูลที่ IQAir เปิดเผยโดยตรง**: แหล่งข้อมูล การรวมค่าเป็นรายชั่วโมง การใช้ median ระดับเมือง การตรวจค่าผิดปกติ ปัจจัยที่ใช้พยากรณ์ และฟังก์ชันในแอป
- **มาตรฐานหรือสูตรทั่วไป**: สูตร interpolation ของ AQI และรูปแบบทางคณิตศาสตร์ที่ใช้สื่อความหมาย
- **ข้อสังเคราะห์สำหรับ ClearPath**: สถาปัตยกรรมและแนวทางที่อนุมานจากเอกสาร ไม่ใช่การเปิดเผยระบบภายในของ IQAir

IQAir ไม่ได้เปิดเผยรายละเอียดสำคัญต่อไปนี้ต่อสาธารณะ:

- สูตร calibration และ coefficient แยกตามอุปกรณ์/ภูมิภาค
- threshold ที่ใช้ตัดข้อมูลผิดปกติ
- quality score หรือ validation weights
- network architecture ของ forecast รุ่นปัจจุบัน
- loss function, hyperparameters และ feature weights
- spatial resolution และ fallback logic ทั้งหมด
- ความแม่นยำของ forecast แยกรายประเทศ/รายพื้นที่
- วิธี uncertainty calibration ภายใน

ดังนั้นห้ามอ้างว่ารู้ “สูตรลับของ IQAir” จากเอกสารนี้ รายละเอียด forecast ที่ IQAir เผยแพร่เป็นคำอธิบายระดับสถาปัตยกรรมและการตลาด ไม่ใช่ model card หรือเอกสารวิชาการที่เปิดให้ทำซ้ำได้ทั้งหมด

## 3. IQAir ได้ข้อมูลมาจากไหน

IQAir ระบุแหล่งข้อมูลหลักอย่างน้อย 4 กลุ่ม:

| แหล่งข้อมูล             | บทบาทโดยสรุป                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| สถานีอ้างอิงของรัฐบาล   | ข้อมูลหลักและแหล่งอ้างอิงสำหรับตรวจเซนเซอร์ราคาประหยัด                                     |
| IQAir AirVisual Outdoor | เพิ่มสถานีจากบ้าน โรงเรียน ชุมชน บริษัท และองค์กร                                          |
| เซนเซอร์ผู้ผลิตอื่น     | ขยายเครือข่ายโดยไม่จำกัดเฉพาะอุปกรณ์ IQAir เช่น PurpleAir และอุปกรณ์บางประเภทที่ระบบรองรับ |
| ดาวเทียมและแบบจำลอง     | ประมาณค่าในพื้นที่ที่ไม่มี ground monitor                                                  |

IQAir อธิบายว่ารวมข้อมูลจาก government reference stations และ low-cost sensors แล้วใช้ correction factor ที่แตกต่างตามรุ่นเซนเซอร์ โดยเฉพาะการลดความคลาดเคลื่อนของ PM2.5 จากความชื้น การสร้าง correction ดังกล่าวอาศัยการติดตั้งเทียบกับ reference station

### 3.1 Contributor ecosystem

ผู้ร่วมให้ข้อมูลมีได้หลายประเภท เช่น:

- หน่วยงานรัฐบาล
- องค์กรไม่แสวงกำไร
- สถาบันการศึกษา
- บริษัท
- บุคคลทั่วไป
- contributor ที่ไม่เปิดเผยชื่อ

IQAir แยกความหมายของ `source` ออกจาก `contributor`:

- **Source** คือแหล่งที่มาของข้อมูลดิบหรือเครือข่ายต้นทาง
- **Contributor** คือบุคคลหรือองค์กรที่เป็นเจ้าของ สนับสนุน ดูแล หรือเผยแพร่สถานี

Contributor สามารถมี profile แสดงชื่อ โลโก้ ภารกิจ เว็บไซต์ social links และรายการสถานี ช่วยสร้างแรงจูงใจด้านชื่อเสียง การสนับสนุนชุมชน และ CSR

### 3.2 การรองรับอุปกรณ์ภายนอก

เอกสาร IQAir กล่าวถึงการเชื่อมอุปกรณ์หลายประเภท รวมถึง IQAir, PurpleAir, Clarity Node-S และอุปกรณ์บางกลุ่ม เจ้าของ PurpleAir สามารถ claim sensor และสร้าง contributor profile บน IQAir ได้

กลไกนี้มีความสำคัญต่อ network effect เพราะเจ้าของอุปกรณ์เดิมไม่จำเป็นต้องเปลี่ยนฮาร์ดแวร์ทั้งหมดเพื่อเข้าร่วมแพลตฟอร์ม

### 3.3 แนวทางการติดตั้งและเผยแพร่สถานี

คู่มือสาธารณะของ IQAir แนะนำให้อุปกรณ์ outdoor:

- มีไฟฟ้าและอินเทอร์เน็ตเสถียร
- อยู่ในจุดที่อากาศไหลผ่าน
- มีการป้องกันสภาพอากาศตามข้อกำหนดของอุปกรณ์
- ติดตั้งแนวตั้งตามคู่มือ
- สูงจากพื้นผิวแนวนอนอย่างน้อยประมาณ 1 เมตร
- ไม่อยู่ติดรถยนต์ เตาบาร์บีคิว ปล่องควัน ครัว หรือแหล่งกำเนิดโดยตรง
- ลงทะเบียนผ่านแอปหรือ dashboard
- ระบุพิกัดและข้อมูลสถานีก่อนส่งขอเผยแพร่

เอกสาร IQAir รุ่นเก่าเคยอธิบายการใช้ข้อมูลตำแหน่ง รูปการติดตั้ง 3 ภาพ และช่วงวิเคราะห์ข้อมูลก่อนเผยแพร่ประมาณ 1–2 สัปดาห์ กระบวนการปัจจุบันอาจเปลี่ยนไปแล้ว จึงควรใช้เป็นหลักฐานเชิงประวัติศาสตร์ ไม่ควรคัดลอกระยะเวลาเป็นข้อกำหนดของ ClearPath โดยตรง

## 4. ทำไม IQAir จึงมีจุดรายงานจำนวนมาก

### 4.1 ใช้โมเดล aggregator

IQAir ไม่ต้องสร้างและดูแลทุกสถานีด้วยตัวเอง แต่รับข้อมูลจากหลายเครือข่ายและจัดรูปแบบให้แสดงร่วมกันได้

### 4.2 ลดอุปสรรคในการเข้าร่วม

เจ้าของเซนเซอร์สามารถลงทะเบียนอุปกรณ์ กำหนดเป็น public ระบุตำแหน่ง และส่งขอเผยแพร่ได้ จึงเพิ่ม supply ของข้อมูลได้เร็วกว่าเครือข่ายที่รับเฉพาะสถานีภาครัฐ

### 4.3 รองรับฮาร์ดแวร์หลายยี่ห้อ

การเชื่อมเซนเซอร์ที่ผู้ใช้มีอยู่แล้วช่วยลดต้นทุนและลด vendor lock-in ในฝั่ง contributor

### 4.4 ให้เครดิตและประโยชน์แก่ผู้สนับสนุน

Contributor profile ทำให้โรงเรียน บริษัท องค์กร และบุคคลเห็นผลตอบแทนเชิงชื่อเสียงจากการเปิดข้อมูล

### 4.5 ใช้ข้อมูลแบบจำลองเติมช่องว่าง

IQAir ใช้เครื่องหมายดอกจันกำกับบาง location เพื่อบอกว่า AQI เป็นค่าประมาณ โดยอาจใช้ PM2.5 จากดาวเทียมในพื้นที่ไม่มี ground monitor จุดเหล่านี้ต้องไม่ถูกนับรวมเป็นสถานีจริง

### 4.6 แสดง entity หลายระดับบนผลิตภัณฑ์เดียว

แผนที่และระบบค้นหาอาจแสดง:

- สถานีจริง
- ค่า aggregate ระดับเมือง
- พื้นที่หรือ location ที่ใช้ข้อมูลสถานีใกล้เคียง
- ค่าประมาณจากดาวเทียมหรือแบบจำลอง

ความหนาแน่นที่ผู้ใช้มองเห็นจึงเป็นความหนาแน่นของข้อมูลและ locations ไม่ใช่ความหนาแน่นของเครื่องตรวจวัดเพียงอย่างเดียว

### 4.7 หลักฐานจาก World Air Quality Report

ในชุดข้อมูลของ World Air Quality Report ปี 2023 IQAir ระบุสัดส่วนประมาณ 39% จากรัฐบาล และ 61% จากองค์กร ชุมชน สถาบันการศึกษา และบุคคล สถิตินี้สะท้อนว่าข้อมูล non-government มีบทบาทมาก แต่เป็นสถิติของชุดข้อมูลในรายงานปีนั้น ไม่ใช่สัดส่วนปัจจุบันของแพลตฟอร์มทั้งหมด

## 5. Logic การประมวลผลข้อมูล

จากเอกสารสาธารณะ pipeline เชิงแนวคิดสามารถสังเคราะห์ได้ดังนี้:

```text
Government stations / IQAir sensors / third-party sensors
                            ↓
                  Ingestion and normalization
                            ↓
         Device-specific and humidity-related correction
                            ↓
       Static/spike/history/weather/neighbor validation
                            ↓
                  One-hour station aggregation
                            ↓
            Station publication and city median
                            ↓
       Satellite/model estimate where monitors are absent
                            ↓
             AQI / forecast / API / maps / alerts
```

แผนผังนี้เป็นข้อสังเคราะห์จากคำอธิบายสาธารณะ ไม่ใช่แผนผัง microservices ภายในที่ IQAir ยืนยัน

### 5.1 การรวมข้อมูลรายสถานี

IQAir ระบุว่า station data ถูก aggregate เป็นค่าเฉลี่ย 1 ชั่วโมง และ timestamp ที่เผยแพร่เป็นชั่วโมงเต็มล่าสุดในลักษณะ retrospective ไม่ใช่ค่าทันทีระดับวินาที

รูปแบบพื้นฐานเขียนได้เป็น:

$$
\bar C_{s,t} = \frac{1}{n}\sum_{i=1}^{n} C_{s,t,i}
$$

เมื่อ:

- $C_{s,t,i}$ คือค่าที่เซนเซอร์ $s$ วัดภายในชั่วโมง $t$
- $n$ คือจำนวนค่าที่ผ่านการตรวจสอบและถูกนำมารวม
- $\bar C_{s,t}$ คือค่าเฉลี่ยรายชั่วโมงของสถานี

IQAir ไม่เปิดเผย minimum sample count หรือ weighting rules สำหรับทุกแหล่งข้อมูล

### 5.2 Data validation

IQAir ระบุว่าข้อมูลผ่าน cloud-based machine-learning validation โดยพิจารณาสัญญาณหลายประเภท เช่น:

- ความสัมพันธ์กับสถานีใกล้เคียง
- ประวัติของสถานี
- อุณหภูมิและความชื้น
- สภาพอากาศ
- องค์ประกอบมลพิษในภูมิภาค
- ข้อมูลหรือภาพจากดาวเทียม
- ค่าที่ค้างนิ่งผิดปกติ
- ค่าที่กระโดดหรือแตกต่างอย่างมีนัยสำคัญ

สถานีที่หยุดรายงานหลายชั่วโมง แสดงค่าค้าง หรือมีพฤติกรรมผิดปกติอาจถูกถอดออกจากการแสดงผลชั่วคราว

ข้อความดังกล่าวเป็นคำอธิบายของ IQAir เอง ไม่ได้เปิด threshold, confusion matrix, false-positive rate หรือผล audit อิสระ

### 5.3 การปรับค่าของ low-cost sensor

เซนเซอร์ optical PM2.5 อาจคลาดเคลื่อนเมื่อความชื้นและองค์ประกอบฝุ่นเปลี่ยน IQAir ระบุว่าใช้ model-specific correction ซึ่งสร้างจากการ co-locate กับ reference station

โครงสร้างเชิงแนวคิดอาจเขียนได้เป็น:

$$
PM_{corrected} = f(PM_{raw}, RH, T, device, region)
$$

โดย $RH$ คือ relative humidity และ $T$ คืออุณหภูมิ แต่สมการนี้เป็นเพียง abstraction สำหรับอธิบาย input ไม่ใช่สูตรจริงของ IQAir

### 5.4 การรวมค่าระดับเมือง

IQAir ระบุว่า city value มาจาก median ของ hourly aggregated concentration จากสถานีที่ใช้ได้ในเมือง:

$$
C_{city,t} = \operatorname{median}(C_{1,t}, C_{2,t}, \ldots, C_{m,t})
$$

ข้อดีของ median คือทนต่อ outlier จากสถานีหนึ่งจุดได้ดีกว่าค่าเฉลี่ยธรรมดา แต่มีข้อจำกัด:

- ไม่สร้างพื้นผิวเชิงพื้นที่
- อาจซ่อน hotspot เฉพาะจุด
- ไม่ได้หมายความว่าค่าทั้งเมืองเท่ากัน
- ผลลัพธ์ขึ้นกับจำนวนและตำแหน่งของสถานีในเมือง

### 5.5 กฎคุณภาพสำหรับรายงานประจำปี

ใน World Air Quality Report ปี 2023 IQAir ระบุการใช้ข้อมูลภาคพื้นดิน ไม่รวม modeled satellite data ในการจัดทำรายงาน และกำหนด availability threshold สำหรับการรวมเมืองในรายงาน โดยรายละเอียดนี้เป็น methodology ของรายงาน ไม่ควรเหมารวมว่าเป็นกฎ realtime ทุกส่วนของผลิตภัณฑ์

## 6. การคำนวณ AQI

IQAir คำนวณ AQI แยกตามสารมลพิษ และใช้สารที่มี AQI สูงที่สุดเป็น dominant pollutant:

$$
AQI_{overall} = \max(AQI_{PM2.5}, AQI_{PM10}, AQI_{O3}, \ldots)
$$

การแปลง concentration เป็น AQI โดยทั่วไปใช้ piecewise linear interpolation ระหว่าง breakpoint:

$$
I = \frac{I_{hi}-I_{lo}}{C_{hi}-C_{lo}}(C-C_{lo})+I_{lo}
$$

เมื่อ:

- $C$ คือความเข้มข้นหลังใช้ averaging/truncation rule ของสารนั้น
- $C_{lo}, C_{hi}$ คือ concentration breakpoints
- $I_{lo}, I_{hi}$ คือ AQI breakpoints
- $I$ คือ AQI ที่คำนวณได้

สูตรนี้เป็นสูตรมาตรฐานทั่วไป ไม่ใช่ proprietary formula ของ IQAir ค่า breakpoint และวิธีเตรียม concentration ต้องยึดมาตรฐาน AQI ที่ผู้ใช้เลือก เช่น US AQI และไม่ควรเปรียบเทียบตัวเลขข้ามมาตรฐานโดยไม่ตรวจการตั้งค่า

## 7. ระบบพยากรณ์ของ IQAir

### 7.1 ข้อมูลนำเข้า

IQAir อธิบาย forecast ว่าเป็น multivariate forecasting ไม่ใช่การลากเส้นจาก PM2.5 ในอดีตเพียงตัวเดียว ปัจจัยที่กล่าวถึงประกอบด้วย:

- คุณภาพอากาศปัจจุบัน
- ประวัติคุณภาพอากาศ
- สภาพอากาศปัจจุบัน
- ประวัติสภาพอากาศ
- พยากรณ์อากาศ
- ทิศทางและความเร็วลม
- ภูมิประเทศหรือภูมิศาสตร์
- รูปแบบตามเวลาและฤดูกาล
- human behavioral patterns
- ค่าคุณภาพอากาศจากพื้นที่รอบข้าง

IQAir กล่าวถึงการพึ่งพา Numerical Weather Prediction โดยเฉพาะ GFS ในคำอธิบายระบบพยากรณ์ และระบุว่ามี feedback loop เพื่อปรับ performance

### 7.2 รูปแบบทางคณิตศาสตร์เชิงแนวคิด

$$
\widehat{PM}_{t+h} = F(
PM_{t-k:t},
Weather_{t-k:t},
WeatherForecast_{t+1:t+h},
SpatialNeighbors,
Calendar,
Geography
)
$$

จากนั้นจึงแปลง $\widehat{PM}_{t+h}$ เป็น AQI สำหรับเวลาอนาคตตามมาตรฐานที่เลือก

สมการนี้เป็น model abstraction ไม่ใช่ implementation ของ IQAir

### 7.3 Deep learning และความเป็นปัจจุบันของข้อมูล

IQAir เคยเผยแพร่บทความอธิบายการใช้ deep/multilayer nonlinear model และ feedback loop ขณะที่หน้าผลิตภัณฑ์ปัจจุบันยังโฆษณา forecast ด้วย ML/AI และการแสดงพยากรณ์หลายวัน อย่างไรก็ตามบทความสถาปัตยกรรมเป็นเอกสารเก่ากว่าผลิตภัณฑ์ปัจจุบัน โมเดลจริงอาจได้รับการเปลี่ยนแปลงแล้ว

### 7.4 ข้อจำกัดของ forecast

ปัจจัยที่ทำให้ forecast ผิดพลาดได้ ได้แก่:

- เหตุการณ์ไฟไหม้หรือภัยพิบัติที่เกิดอย่างฉับพลัน
- การเปลี่ยนนโยบายหรือกิจกรรมมนุษย์ที่โมเดลไม่เคยเห็น
- ความผิดพลาดของ weather forecast
- ภูมิประเทศซับซ้อน
- station coverage ไม่สม่ำเสมอ
- sensor drift และข้อมูลขาดหาย
- forecast horizon ที่ไกลขึ้น

IQAir ไม่เปิดรายละเอียด uncertainty interval ต่อจุดอย่างเพียงพอสำหรับนำโมเดลไปทำซ้ำ

## 8. UX/UI ของ IQAir

### 8.1 งานหลักที่แอปพยายามตอบ

ลำดับข้อมูลของผลิตภัณฑ์ IQAir โดยทั่วไปพยายามตอบคำถามผู้ใช้ดังนี้:

1. ตอนนี้อากาศเป็นอย่างไร
2. ส่งผลต่อฉันอย่างไรและควรทำอะไร
3. อีกไม่กี่ชั่วโมงหรืออีกหลายวันจะเป็นอย่างไร
4. พื้นที่อื่นเป็นอย่างไร
5. ข้อมูลมาจากสถานีหรือ contributor ใด

### 8.2 ฟังก์ชันหลัก

ข้อมูลจากหน้าผลิตภัณฑ์และ App Store กล่าวถึงฟังก์ชันเหล่านี้:

- AQI ปัจจุบันและสีตามระดับ
- dominant pollutant
- ความเข้มข้นของสารมลพิษหลายประเภท
- คำแนะนำสุขภาพ
- forecast รายชั่วโมงและรายวัน
- ประวัติประมาณ 48 ชั่วโมง และข้อมูลย้อนหลังในหลายระดับ
- แผนที่ 2D/3D
- ตำแหน่งโปรดและ widgets
- smart alerts
- weather data
- wildfire/satellite hotspot information
- pollen ในบางพื้นที่
- city ranking
- contributor และ data-source details
- การเชื่อมอุปกรณ์ indoor/outdoor
- การสลับดู city และ station
- map filters และ saved locations

### 8.3 จุดแข็งด้าน UX

- ใช้ค่า AQI และสีสร้าง visual hierarchy ที่อ่านได้เร็ว
- แปลงข้อมูลเทคนิคให้เป็นคำแนะนำเชิงพฤติกรรม
- ใช้ favorites, widgets และ alerts สร้างการกลับมาใช้งานซ้ำ
- ทำให้ผู้ใช้สำรวจเชิงพื้นที่ผ่านแผนที่
- มีรายละเอียดแหล่งข้อมูลและ contributor เพื่อสนับสนุนความโปร่งใส
- เชื่อม indoor และ outdoor context ใน ecosystem เดียว

### 8.4 ความเสี่ยงด้าน UX

เมื่อรวม air quality, forecast, weather, pollen, fire, ranking, devices, contributors และ historical data ไว้ด้วยกัน แอปมีความเสี่ยงต่อข้อมูลแน่นเกินไป โดยเฉพาะบน mobile

ClearPath ควรใช้ progressive disclosure:

- **ชั้นที่ 1:** PM2.5/AQI ปัจจุบัน ความสด และคำแนะนำ
- **ชั้นที่ 2:** forecast และกราฟแนวโน้ม
- **ชั้นที่ 3:** source, quality, station และพื้นที่ครอบคลุม
- **ชั้นที่ 4:** technical detail, contributor และ methodology

### 8.5 รูปแบบหน้า mobile ที่แนะนำสำหรับ ClearPath

#### หน้า Home/Map

- การ์ดสรุป PM2.5/AQI ของตำแหน่งผู้ใช้
- ข้อความแนะนำที่อ่านจบในหนึ่งบรรทัด
- เวลาอัปเดตและประเภทข้อมูล
- แผนที่เต็มพื้นที่ที่ใช้ bottom sheet
- filter แยก official/community/modeled/forecast
- legend ที่เปิดดูได้โดยไม่บังแผนที่

#### หน้า Location detail

- ค่า current พร้อมสถานะสุขภาพ
- tabs: `ขณะนี้`, `พยากรณ์`, `ย้อนหลัง`
- source และ freshness
- confidence/quality badge
- รายละเอียดสถานีหรือวิธีประมาณ

#### หน้า Forecast

- กราฟรายชั่วโมงก่อนรายวัน
- forecast horizon และเวลาออกรอบพยากรณ์
- uncertainty band
- คำอธิบายว่าเป็น forecast ไม่ใช่ค่าตรวจวัด
- แสดง fallback/provider อย่างโปร่งใส

#### หน้า Community

- แยกรายงานครั้งเดียวออกจากสถานีส่งข้อมูลต่อเนื่อง
- คำขอบคุณและดาว 1–5 ตามกติกา ClearPath
- สถานะ pending/approved/expired ที่ผู้ส่งเข้าใจได้
- ไม่เปิดพิกัดจริงหรือภาพ private ต่อสาธารณะ

#### หน้า Source/Methodology

- อธิบาย measured, aggregated, interpolated และ forecast
- แสดงแหล่งข้อมูลแต่ละจุด
- แสดงข้อจำกัดและเวลาที่ข้อมูลหมดอายุ
- หลีกเลี่ยงภาษาที่ทำให้ค่าประมาณดูเหมือนค่าตรวจวัดจริง

## 9. สิ่งที่ ClearPath ควรนำมาปรับใช้

### 9.1 แยกชนิดข้อมูลด้วย marker และ label

| ประเภท            | รูปแบบที่แนะนำ          | ความหมาย                               |
| ----------------- | ----------------------- | -------------------------------------- |
| สถานีทางการ       | วงกลมทึบ                | เครื่องตรวจภาคพื้นดินจากหน่วยงานทางการ |
| สถานีชุมชนผ่าน QC | วงกลมมีขอบ              | เซนเซอร์ต่อเนื่องที่ผ่านกฎคุณภาพ       |
| รายงานผู้ใช้      | จุดเล็กหรือ cluster     | snapshot จากผู้ใช้ ไม่ใช่สถานีถาวร     |
| ค่าประมาณ/IDW     | พื้นที่สีหรือสี่เหลี่ยม | ไม่มีเครื่องวัดตรงตำแหน่งนั้น          |
| Forecast          | เส้นประหรือ badge       | ค่าของเวลาอนาคต                        |

ห้ามใช้ marker แบบเดียวกันจนผู้ใช้เข้าใจว่าทุกจุดเป็น direct measurement

### 9.2 แยก one-off report ออกจาก community station

รายงานจากภาพหรือเครื่องวัดหนึ่งครั้งเป็น snapshot และไม่เทียบเท่าเซนเซอร์ที่ส่งข้อมูลต่อเนื่อง หาก ClearPath ต้องการขยายจำนวนจุดอย่างมีคุณภาพ ควรเพิ่ม registered community device flow ที่มี:

- device ID และ serial/ownership verification
- รุ่นเซนเซอร์และ calibration profile
- heartbeat และ data continuity
- clock-drift detection
- installation verification
- รูปติดตั้งใน private storage
- private coordinates และ public obfuscation
- probation state ก่อนเผยแพร่
- automatic suspension เมื่อข้อมูลค้างหรือผิดปกติ
- maintenance/calibration history

ส่วน one-off report ควรเป็น supplementary signal ตาม Trust policy ของ ClearPath

### 9.3 Data pipeline ที่เหมาะกับ ClearPath

```text
Raw observation
    ↓
Schema / timestamp / GPS validation
    ↓
Duplicate / static / spike / source checks
    ↓
Device-specific correction
    ↓
Hourly aggregation
    ↓
Spatial corroboration using Haversine distance
    ↓
Quality score + provenance + freshness
    ↓
Official-first data fusion
    ↓
IDW forecast/observed surface
    ↓
Forecast + uncertainty + fallback
    ↓
Mobile map / alerts / API
```

แนวทางนี้สอดคล้องกับกติกา ClearPath ที่กำหนดให้ Air4Thai ที่สดและอยู่ใกล้เป็นข้อมูลหลัก ส่วน community เป็นข้อมูลเสริม และ production interpolation ใช้ IDW แบบ Haversine

### 9.4 การใช้ community data กับ forecast

ไม่ควรป้อนค่ารายงานผู้ใช้ดิบทั้งหมดเข้า forecast model โดยตรง เนื่องจากมี selection bias ความถี่ไม่เท่ากัน เวลาไม่ตรงกัน และอุปกรณ์ต่างชนิดกัน ควรสร้าง aggregate features ก่อน เช่น:

- median ของ community PM2.5 ในรัศมี
- จำนวนผู้รายงานคนละคน
- trust-weighted median
- ระยะทางจากสถานีทางการ
- อายุข้อมูล
- ความสอดคล้องกับ Air4Thai
- สัดส่วนรายงานที่ผ่าน QC
- dispersion ของค่ารายงาน
- จำนวน calibrated devices

ตัวอย่างเชิงแนวคิด:

$$
C_{community} = \operatorname{weightedMedian}
(C_i, Trust_i \times Freshness_i \times Quality_i)
$$

จากนั้นใช้เป็น supplementary residual correction หลังผ่าน rolling backtest และ shadow test ไม่ควรให้ community override สถานี Air4Thai ที่สดและอยู่ภายในระยะหลักทันที

### 9.5 Contributor loop ที่ควรสร้าง

```text
รองรับอุปกรณ์และรายงานที่ตรวจสอบได้
                ↓
Onboarding และ publication ที่เข้าใจง่าย
                ↓
ตรวจคุณภาพและแสดง provenance
                ↓
ให้เครดิต/คำขอบคุณ contributor
                ↓
ผู้ใช้ได้รับแผนที่ forecast และ alert ที่มีประโยชน์
                ↓
ชุมชนและองค์กรเห็นคุณค่าของการเพิ่มสถานี
                ↓
coverage และคุณภาพข้อมูลเพิ่มขึ้น
```

## 10. สิ่งที่ไม่ควรคัดลอกจาก IQAir โดยตรง

- ไม่ควรไล่เพิ่มจำนวนหมุดโดยไม่แยกประเภทหลักฐาน
- ไม่ควรนำ marketing count ของ locations มาใช้แทนจำนวน ground stations
- ไม่ควรอ้างว่าใช้ AI แล้วแม่นโดยไม่มี backtest และ uncertainty
- ไม่ควรนำสูตร correction ของพื้นที่อื่นมาใช้โดยไม่ co-location ในไทย
- ไม่ควรใช้ city median แทน spatial surface ทุกกรณี
- ไม่ควรให้ค่าจากดาวเทียมหรือ IDW ดูเหมือน direct measurement
- ไม่ควรนำรายงานครั้งเดียวไปเทียบเท่าสถานีถาวร
- ไม่ควรเพิ่มทุกฟังก์ชันลงหน้า Home จน mobile UI อ่านยาก
- ไม่ควรคัดลอกข้อกำหนดด้านข้อมูลหรือ licensing โดยไม่ประเมิน privacy และกฎหมายไทย

## 11. Product and engineering implications for ClearPath

### P0 — ความน่าเชื่อถือก่อนเพิ่มจำนวนจุด

- นิยาม entity: station, report, aggregate, interpolation, forecast
- เพิ่ม provenance และ freshness ให้ทุกค่าที่เผยแพร่
- แยก marker และ legend
- บังคับใช้ official-first policy
- แสดง uncertainty/fallback ของ forecast
- ใช้พิกัด public ที่ผ่าน stable obfuscation สำหรับ community

### P1 — Community device network

- ออกแบบ registered-device contract
- สร้าง onboarding และ probation flow
- เก็บ device model/calibration/maintenance metadata
- ตรวจ static, spike, missing, duplicate, drift และ placement risk
- ทำ contributor profile หรือ acknowledgment ที่ไม่เปิดข้อมูลส่วนตัวเกินจำเป็น

### P2 — Forecast improvement

- สร้าง hourly feature table ที่ versioned
- ใช้ weather forecast, temporal features และ spatial neighbors
- แยก baseline ออกจาก advanced model
- ทำ rolling backtest แยกตามสถานี ฤดูกาล และ horizon
- calibrate prediction intervals
- ใช้ community aggregate เฉพาะเมื่อผ่าน quality gates
- ทำ shadow deployment, canary และ rollback

### P3 — Mobile UX

- Home เป็น map-first พร้อม current summary
- ใช้ bottom sheet และ progressive disclosure
- ทำ forecast/history/source เป็นหน้าหรือ tabs ที่ชัดเจน
- จำกัดข้อมูลระดับแรกให้ผู้ใช้ตัดสินใจได้ในไม่กี่วินาที
- ตรวจ accessibility: contrast, text alternatives, touch target, screen reader และไม่ใช้สีเป็นสัญญาณเดียว

## 12. ข้อสรุป

สิ่งที่ทำให้ IQAir มี coverage สูงไม่ใช่ forecast model เพียงอย่างเดียว แต่เป็นการสร้างวงจรข้อมูลและผลิตภัณฑ์ที่เชื่อมกัน:

1. รวมข้อมูลจากหลายแหล่ง
2. รองรับ community และ third-party hardware
3. ทำ normalization และ automated quality control
4. ให้เครดิต contributor
5. ใช้ข้อมูลแบบจำลองเติมพื้นที่ที่ไม่มีสถานี พร้อม label
6. เปลี่ยนข้อมูลเป็นแผนที่ forecast alerts และ health guidance ที่ผู้ใช้เข้าใจง่าย

บทเรียนหลักสำหรับ ClearPath คือไม่ควรเลียนแบบเพียง “จำนวนจุด” แต่ควรเลียนแบบโครงสร้าง provenance, onboarding, quality control, hourly normalization, contributor incentives และการแยก measured/estimated/forecast ให้ชัดเจน

## 13. แหล่งข้อมูลอ้างอิง

### Data computation and validation

1. [IQAir — Air quality data computation](https://www.iqair.com/support-articles/air-quality/data-computation)
2. [IQAir — How air quality data is validated](https://www.iqair.com/gb/support/knowledge-base/KA-04810-GB)
3. [IQAir — How ranking air-quality data is collected, processed, and calculated](https://www.iqair.com/in-en/newsroom/how-is-the-ranking-air-quality-data-collected-processed-and-calculated)
4. [IQAir — How to check the data source of a station](https://www.iqair.com/ca/support/knowledge-base/how-can-i-check-the-data-source-of-a-station)
5. [IQAir — Meaning of the asterisk on estimated AQI locations](https://www.iqair.com/us/support/knowledge-base/what-does-the-asterisk-mean-on-some-locations-aqi)

### Forecast

6. [IQAir — Understanding AirVisual forecasting and deep machine learning](https://www.iqair.com/us/newsroom/understanding-airvisual-s-forecasting-method-deep-machine-learning)
7. [IQAir — How IQAir's air-quality forecast is calculated](https://www.iqair.com/gb/support/knowledge-base/KA-04848-GB)

### Contributors and sensor network

8. [IQAir — How contributors and sources are credited](https://www.iqair.com/sg/support/knowledge-base/how-air-quality-data-contributors-and-sources-are-credited-on-the-iqair-website-and-app)
9. [IQAir — How low-cost sensor owners contribute data](https://www.iqair.com/qa/support/knowledge-base/how-do-low-cost-sensor-owners-contribute-data-and-publish-a-contributor-profile)
10. [IQAir — How to claim a PurpleAir sensor](https://www.iqair.com/support/knowledge-base/how-to-claim-your-purpleair-sensor)
11. [IQAir — How to make outdoor AirVisual device data public](https://www.iqair.com/as/support/knowledge-base/how-can-i-make-my-outdoor-airvisual-devices-data-public)
12. [IQAir — Air pollution data collection movement](https://www.iqair.com/in-en/newsroom/air-pollution-data-collection-movement)
13. [IQAir — AirVisual Outdoor user manual (PDF)](https://www2.iqair.com/sites/default/files/documents/AVO%20User%20Manual_EN.pdf)
14. [IQAir — Platform terms](https://www.iqair.com/legal/platform-terms)

### Reports, API, and product UX

15. [IQAir — 2023 World Air Quality Report (PDF)](https://www.iqair.com/dl/2023_World_Air_Quality_Report.pdf)
16. [IQAir — AirVisual air-quality app](https://www.iqair.com/air-quality-monitors/air-quality-app)
17. [Apple App Store — IQAir AirVisual](https://apps.apple.com/us/app/iqair-airvisual-air-quality/id1048912974)
18. [IQAir — Accessing historical data](https://www.iqair.com/support/knowledge-base/how-can-i-access-historical-data-on-the-iqair-platform)
19. [IQAir AirVisual API documentation](https://api-docs.iqair.com/)

## 14. หมายเหตุสำหรับการอ้างอิงในงานพัฒนาต่อ

- ตรวจวันที่และเนื้อหาของหน้า IQAir อีกครั้งก่อนนำไปใช้ใน specification หรือข้อความที่แสดงต่อผู้ใช้ เพราะ knowledge-base และจำนวนเครือข่ายอาจเปลี่ยนได้
- ใช้ถ้อยคำ “IQAir ระบุว่า” เมื่อกล่าวถึงประสิทธิภาพ ML หรือ validation ที่ยังไม่มี independent audit ประกอบ
- แยกข้อความที่เป็น public fact ออกจากข้อเสนอของ ClearPath ในเอกสารออกแบบทุกครั้ง
- หากต้องตัดสินใจเรื่อง health communication, privacy, licensing หรือการใช้ข้อมูลภายนอก ควรตรวจข้อกำหนดและกฎหมายฉบับปัจจุบันเพิ่มเติม
