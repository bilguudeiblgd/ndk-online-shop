package api

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"

	"live-selling/internal/excel"
)

type ExcelHandlers struct{}

func NewExcelHandlers() *ExcelHandlers {
	return &ExcelHandlers{}
}

func (h *ExcelHandlers) FilterExcel(w http.ResponseWriter, r *http.Request) {
	r.ParseMultipartForm(10 << 20)

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "файл шаардлагатай", http.StatusBadRequest)
		return
	}
	defer file.Close()

	priceStr := r.FormValue("price")
	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil || price <= 0 {
		http.Error(w, "зөв үнэ оруулна уу", http.StatusBadRequest)
		return
	}

	mode := excel.FilterMode(r.FormValue("mode"))
	if mode == "" {
		mode = excel.ModePriceOnly
	}
	code := r.FormValue("code")

	if mode == excel.ModePriceCode && code == "" {
		http.Error(w, "код оруулна уу", http.StatusBadRequest)
		return
	}

	params := excel.FilterParams{
		Price: price,
		Mode:  mode,
		Code:  code,
	}

	log.Printf("[excel] файл: %s, үнэ: %.0f₮, горим: %s, код: %s", header.Filename, price, mode, code)

	fileBytes, err := io.ReadAll(file)
	if err != nil {
		http.Error(w, "файл уншиж чадсангүй", http.StatusInternalServerError)
		return
	}

	result, outputBytes, err := excel.FilterTransactions(fileBytes, params)
	if err != nil {
		log.Printf("[excel] алдаа: %v", err)
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}

	log.Printf("[excel] нийт: %d, зөв: %d, дүн буруу: %d, код байхгүй: %d, утас байхгүй: %d, таарахгүй: %d",
		result.Total, result.AcceptedCount, len(result.BadAmount), len(result.BadCode), len(result.BadPhone), len(result.NoMatch))

	if r.URL.Query().Get("format") == "json" {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"total":    result.Total,
			"accepted": result.AcceptedCount,
			"badAmount": len(result.BadAmount),
			"badCode":  len(result.BadCode),
			"badPhone": len(result.BadPhone),
			"noMatch":  len(result.NoMatch),
		})
		return
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="filtered_%s"`, header.Filename))
	w.Write(outputBytes)
}
